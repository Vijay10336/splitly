package dev.vijay.splitly;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:splitly;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
      "spring.datasource.username=sa",
      "spring.datasource.password="
    })
@AutoConfigureMockMvc
class AppIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate db;
  @Autowired AuthService auth;
  @Autowired LedgerService ledger;
  @MockitoBean MailService mail;

  JsonNode postJson(String path, Object body, String token, int status) throws Exception {
    var request = post(path).contentType("application/json").content(json.writeValueAsBytes(body));
    if (token != null) request.header("Authorization", "Bearer " + token);
    return json.readTree(
        mvc.perform(request)
            .andExpect(status().is(status))
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  JsonNode signup(String email) throws Exception {
    return postJson(
        "/api/auth/signup",
        Map.of("name", "Vijay", "email", email, "password", "correct-horse-42"),
        null,
        200);
  }

  record Fixture(String token, AuthService.User user, String groupId, List<String> members) {}

  Fixture group() throws Exception {
    String suffix = UUID.randomUUID().toString();
    var account = signup(suffix + "@example.com");
    String token = account.path("token").asText(), uid = account.path("user").path("id").asText();
    String groupId = UUID.randomUUID().toString();
    List<String> ids =
        java.util.stream.IntStream.range(0, 3)
            .mapToObj(i -> UUID.randomUUID().toString())
            .sorted()
            .toList();
    List<Map<String, String>> members =
        List.of(
            Map.of("id", ids.get(0), "name", "Vijay", "email", suffix + "@example.com"),
            Map.of("id", ids.get(1), "name", "Friend", "email", suffix + "friend@example.com"),
            Map.of("id", ids.get(2), "name", "Guest", "email", ""));
    var command =
        new LedgerService.Command(
            UUID.randomUUID().toString(),
            "createGroup",
            groupId,
            json.valueToTree(Map.of("name", "Weekend", "currency", "INR", "members", members)));
    postJson("/api/commands", command, token, 200);
    return new Fixture(token, auth.user(uid), groupId, ids);
  }

  LedgerService.Command expense(Fixture f, long amount) {
    return new LedgerService.Command(
        UUID.randomUUID().toString(),
        "addExpense",
        f.groupId(),
        json.valueToTree(
            Map.of(
                "title",
                "Dinner",
                "amount",
                amount,
                "payerId",
                f.members().get(0),
                "participants",
                f.members())));
  }

  @Test
  void exactSplitsRetriesAndSettlement() throws Exception {
    var f = group();
    var command = expense(f, 100);
    postJson("/api/commands", command, f.token(), 200);
    postJson("/api/commands", command, f.token(), 200);
    var group = ledger.state(f.user()).groups().get(0);
    assertEquals(1, group.expenses().size());
    assertEquals(
        List.of(34L, 33L, 33L),
        group.expenses().get(0).shares().stream().map(LedgerService.Share::amount).toList());
    assertEquals(0, group.members().stream().mapToLong(LedgerService.Member::balance).sum());
    var settlement =
        new LedgerService.Command(
            UUID.randomUUID().toString(),
            "settle",
            f.groupId(),
            json.valueToTree(
                Map.of("fromId", f.members().get(1), "toId", f.members().get(0), "amount", 33)));
    postJson("/api/commands", settlement, f.token(), 200);
    var tooMuch =
        new LedgerService.Command(
            UUID.randomUUID().toString(),
            "settle",
            f.groupId(),
            json.valueToTree(
                Map.of("fromId", f.members().get(1), "toId", f.members().get(0), "amount", 1)));
    postJson("/api/commands", tooMuch, f.token(), 400);
    assertEquals(
        0,
        ledger.state(f.user()).groups().get(0).members().stream()
            .filter(m -> m.id().equals(f.members().get(1)))
            .findFirst()
            .orElseThrow()
            .balance());
  }

  @Test
  void accessRequiresMembershipAndVerifiedEmail() throws Exception {
    var f = group();
    var stranger = signup(UUID.randomUUID() + "@example.com");
    String otherToken = stranger.path("token").asText();
    postJson("/api/commands", expense(f, 500), otherToken, 403);
    var otherState =
        mvc.perform(get("/api/state").header("Authorization", "Bearer " + otherToken))
            .andExpect(status().isOk())
            .andReturn();
    assertEquals(
        0, json.readTree(otherState.getResponse().getContentAsString()).path("groups").size());
    String invitedEmail = ledger.state(f.user()).groups().get(0).members().get(1).email();
    var invited = signup(invitedEmail);
    var invitedUser = auth.user(invited.path("user").path("id").asText());
    assertTrue(ledger.state(invitedUser).groups().isEmpty());
    db.update("UPDATE app_users SET verified=TRUE WHERE id=?", invitedUser.id());
    postJson("/api/commands", expense(f, 500), invited.path("token").asText(), 200);
    assertEquals(1, ledger.state(invitedUser).groups().size());
    mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
  }

  @Test
  void validatesAmountsParticipantsAndConflictingRetries() throws Exception {
    var f = group();
    postJson("/api/commands", expense(f, 0), f.token(), 400);
    postJson("/api/commands", expense(f, 100000001), f.token(), 400);
    var original = expense(f, 300);
    postJson("/api/commands", original, f.token(), 200);
    var changed =
        new LedgerService.Command(
            original.id(),
            original.type(),
            original.groupId(),
            json.valueToTree(
                Map.of(
                    "title",
                    "Changed",
                    "amount",
                    400,
                    "payerId",
                    f.members().get(0),
                    "participants",
                    f.members())));
    postJson("/api/commands", changed, f.token(), 409);
    var invalid =
        new LedgerService.Command(
            UUID.randomUUID().toString(),
            "addExpense",
            f.groupId(),
            json.valueToTree(
                Map.of(
                    "title",
                    "Bad",
                    "amount",
                    50,
                    "payerId",
                    f.members().get(0),
                    "participants",
                    List.of(UUID.randomUUID().toString()))));
    postJson("/api/commands", invalid, f.token(), 400);
    assertEquals(1, ledger.state(f.user()).groups().get(0).expenses().size());
  }

  @Test
  void passwordResetIsSingleUseAndRevokesSessions() throws Exception {
    String email = UUID.randomUUID() + "@example.com";
    var account = signup(email);
    postJson("/api/auth/login", Map.of("email", email, "password", "wrong"), null, 401);
    postJson("/api/auth/forgot", Map.of("email", email), null, 200);
    var capture = org.mockito.ArgumentCaptor.forClass(String.class);
    verify(mail).send(eq(email), eq("Reset your Splitly password"), capture.capture(), isNull());
    String raw = capture.getValue().split("reset=")[1];
    postJson("/api/auth/reset", Map.of("token", raw, "password", "new-password-456"), null, 200);
    postJson("/api/auth/reset", Map.of("token", raw, "password", "another-password"), null, 400);
    mvc.perform(
            get("/api/state").header("Authorization", "Bearer " + account.path("token").asText()))
        .andExpect(status().isUnauthorized());
    postJson("/api/auth/login", Map.of("email", email, "password", "new-password-456"), null, 200);
  }

  @Test
  void googleExchangeIsBoundToDeviceVerifier() throws Exception {
    var account = signup(UUID.randomUUID() + "@example.com");
    String id = account.path("user").path("id").asText();
    String verifier = AuthService.random();
    String challenge =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(HexFormat.of().parseHex(AuthService.hash(verifier)));
    String ticket = auth.token(id, "exchange", 120, challenge);
    postJson(
        "/api/auth/google/exchange",
        Map.of("code", ticket, "verifier", AuthService.random()),
        null,
        400);
    postJson("/api/auth/google/exchange", Map.of("code", ticket, "verifier", verifier), null, 200);
    postJson("/api/auth/google/exchange", Map.of("code", ticket, "verifier", verifier), null, 400);
  }

  @Test
  void concurrentRetriesInsertOnlyOnce() throws Exception {
    var f = group();
    var command = expense(f, 101);
    try (var pool = new Pool()) {
      List<Future<?>> futures = new ArrayList<>();
      for (int i = 0; i < 4; i++)
        futures.add(pool.executor.submit(() -> ledger.command(f.user(), command)));
      for (var future : futures) future.get(15, TimeUnit.SECONDS);
    }
    assertEquals(1, ledger.state(f.user()).groups().get(0).expenses().size());
  }

  static class Pool implements AutoCloseable {
    final ExecutorService executor = Executors.newFixedThreadPool(4);

    public void close() {
      executor.shutdownNow();
    }
  }
}
