package dev.vijay.splitly;

import com.fasterxml.jackson.databind.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class LedgerService {
  record Member(String id, String name, String email, long balance) {}

  record Share(String memberId, long amount) {}

  record Expense(
      String id, String title, long amount, String payerId, long createdAt, List<Share> shares) {}

  record Settlement(String id, String fromId, String toId, long amount, long createdAt) {}

  record Group(
      String id,
      String name,
      String currency,
      String ownerId,
      List<Member> members,
      List<Expense> expenses,
      List<Settlement> settlements) {}

  record State(int version, AuthService.User user, List<Group> groups, long savedAt) {}

  record Command(String id, String type, String groupId, JsonNode payload) {}

  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final AuthService auth;

  LedgerService(JdbcTemplate db, ObjectMapper json, AuthService auth) {
    this.db = db;
    this.json = json;
    this.auth = auth;
  }

  @Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  State state(AuthService.User current) {
    AuthService.User user = auth.user(current.id());
    var ids =
        db.queryForList(
            "SELECT DISTINCT g.id FROM expense_groups g LEFT JOIN members m ON m.group_id=g.id "
                + "WHERE g.owner_id=? OR (m.email=? AND ?=TRUE) ORDER BY g.id",
            String.class,
            user.id(),
            user.email(),
            user.verified());
    return new State(1, user, ids.stream().map(this::group).toList(), Instant.now().toEpochMilli());
  }

  Group group(String id) {
    var row = db.queryForMap("SELECT * FROM expense_groups WHERE id=?", id);
    var expenses =
        db.query(
            "SELECT * FROM expenses WHERE group_id=? ORDER BY created_at DESC,id",
            (r, n) -> {
              String eid = r.getString("id");
              return new Expense(
                  eid,
                  r.getString("title"),
                  r.getLong("amount"),
                  r.getString("payer_id"),
                  r.getLong("created_at"),
                  db.query(
                      "SELECT member_id,amount FROM shares WHERE expense_id=? ORDER BY member_id",
                      (s, i) -> new Share(s.getString(1), s.getLong(2)),
                      eid));
            },
            id);
    var settlements =
        db.query(
            "SELECT * FROM settlements WHERE group_id=? ORDER BY created_at DESC,id",
            (r, n) ->
                new Settlement(
                    r.getString("id"),
                    r.getString("from_id"),
                    r.getString("to_id"),
                    r.getLong("amount"),
                    r.getLong("created_at")),
            id);
    Map<String, Long> balances = new HashMap<>();
    for (Expense expense : expenses) {
      balances.merge(expense.payerId(), expense.amount(), Long::sum);
      for (Share share : expense.shares())
        balances.merge(share.memberId(), -share.amount(), Long::sum);
    }
    for (Settlement settlement : settlements) {
      balances.merge(settlement.fromId(), settlement.amount(), Long::sum);
      balances.merge(settlement.toId(), -settlement.amount(), Long::sum);
    }
    var members =
        db.query(
            "SELECT * FROM members WHERE group_id=? ORDER BY position",
            (r, n) ->
                new Member(
                    r.getString("id"),
                    r.getString("name"),
                    r.getString("email"),
                    balances.getOrDefault(r.getString("id"), 0L)),
            id);
    return new Group(
        id,
        (String) row.get("name"),
        (String) row.get("currency"),
        (String) row.get("owner_id"),
        members,
        expenses,
        settlements);
  }

  private String string(JsonNode p, String key, int max) {
    return AuthService.text(p.path(key).asText(null), max);
  }

  private long amount(JsonNode p) {
    JsonNode amount = p.path("amount");
    if (!amount.isIntegralNumber()
        || !amount.canConvertToLong()
        || amount.asLong() < 1
        || amount.asLong() > 100_000_000)
      throw ApiException.bad("Enter an amount between 0.01 and 1,000,000.00.");
    return amount.asLong();
  }

  private String uuid(String value) {
    try {
      return UUID.fromString(value).toString();
    } catch (Exception e) {
      throw ApiException.bad("Invalid record ID.");
    }
  }

  @Transactional
  void command(AuthService.User current, Command cmd) {
    if (cmd == null || cmd.payload() == null || !cmd.payload().isObject())
      throw ApiException.bad("Invalid change.");
    String commandId = uuid(cmd.id()), groupId = uuid(cmd.groupId());
    String fingerprint;
    try {
      fingerprint = AuthService.hash(json.writeValueAsString(cmd));
    } catch (Exception e) {
      throw ApiException.bad("Invalid change.");
    }
    // Serialize retries from this account, then serialize changes to the shared group.
    db.queryForMap("SELECT id FROM app_users WHERE id=? FOR UPDATE", current.id());
    AuthService.User user = auth.user(current.id());
    var prior = db.queryForList("SELECT user_id,fingerprint FROM commands WHERE id=?", commandId);
    if (!prior.isEmpty()) {
      if (!user.id().equals(prior.get(0).get("user_id"))
          || !fingerprint.equals(prior.get(0).get("fingerprint")))
        throw new ApiException(HttpStatus.CONFLICT, "A different change already uses this ID.");
      return;
    }
    JsonNode p = cmd.payload();
    long now = Instant.now().toEpochMilli();
    if ("createGroup".equals(cmd.type())) {
      createGroup(user, groupId, p, now);
    } else {
      var rows =
          db.queryForList("SELECT id,owner_id FROM expense_groups WHERE id=? FOR UPDATE", groupId);
      if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Group not found.");
      boolean owner = user.id().equals(rows.get(0).get("owner_id"));
      boolean member =
          user.verified()
              && !db.queryForList(
                      "SELECT id FROM members WHERE group_id=? AND email=?", groupId, user.email())
                  .isEmpty();
      if (!owner && !member)
        throw new ApiException(HttpStatus.FORBIDDEN, "You do not have access to this group.");
      if ("addExpense".equals(cmd.type())) addExpense(commandId, groupId, p, now);
      else if ("settle".equals(cmd.type())) settle(commandId, groupId, p, now);
      else throw ApiException.bad("Unknown change type.");
    }
    db.update(
        "INSERT INTO commands(id,user_id,fingerprint,created_at) VALUES(?,?,?,?)",
        commandId,
        user.id(),
        fingerprint,
        now);
  }

  private void createGroup(AuthService.User user, String groupId, JsonNode p, long now) {
    String name = string(p, "name", 80), currency = string(p, "currency", 3);
    if (!List.of("INR", "USD", "EUR", "GBP", "AUD", "CAD").contains(currency))
      throw ApiException.bad("Choose a supported currency.");
    JsonNode members = p.path("members");
    if (!members.isArray() || members.size() < 2 || members.size() > 50)
      throw ApiException.bad("Add between 2 and 50 people.");
    Set<String> emails = new HashSet<>(), ids = new HashSet<>();
    boolean includesOwner = false;
    for (JsonNode member : members) {
      if (!ids.add(uuid(member.path("id").asText())))
        throw ApiException.bad("Duplicate person ID.");
      string(member, "name", 80);
      String email = member.path("email").asText("").trim();
      if (!email.isEmpty()) {
        email = AuthService.email(email);
        if (!emails.add(email)) throw ApiException.bad("Use a different email for each person.");
        includesOwner |= email.equals(user.email());
      }
    }
    if (!includesOwner) throw ApiException.bad("Include yourself in the group.");
    db.update(
        "INSERT INTO expense_groups(id,owner_id,name,currency,created_at) VALUES(?,?,?,?,?)",
        groupId,
        user.id(),
        name,
        currency,
        now);
    int position = 0;
    for (JsonNode member : members) {
      String email = member.path("email").asText("").trim();
      db.update(
          "INSERT INTO members(id,group_id,name,email,position) VALUES(?,?,?,?,?)",
          uuid(member.path("id").asText()),
          groupId,
          string(member, "name", 80),
          email.isEmpty() ? null : AuthService.email(email),
          position++);
    }
  }

  private void requireMember(String groupId, String memberId) {
    if (db.queryForList("SELECT id FROM members WHERE group_id=? AND id=?", groupId, memberId)
        .isEmpty()) throw ApiException.bad("Choose a person in this group.");
  }

  private void addExpense(String id, String groupId, JsonNode p, long now) {
    long amount = amount(p);
    String payer = string(p, "payerId", 36);
    requireMember(groupId, payer);
    JsonNode participants = p.path("participants");
    if (!participants.isArray() || participants.isEmpty() || participants.size() > 50)
      throw ApiException.bad("Select who shares this expense.");
    List<String> ids = new ArrayList<>();
    for (JsonNode participant : participants) {
      String mid = participant.asText();
      requireMember(groupId, mid);
      if (ids.contains(mid)) throw ApiException.bad("A person can only share once.");
      ids.add(mid);
    }
    Collections.sort(ids);
    db.update(
        "INSERT INTO expenses(id,group_id,title,amount,payer_id,created_at) VALUES(?,?,?,?,?,?)",
        id,
        groupId,
        string(p, "title", 120),
        amount,
        payer,
        now);
    // Deterministic remainder allocation preserves every minor currency unit on every device.
    for (int i = 0; i < ids.size(); i++)
      db.update(
          "INSERT INTO shares(expense_id,member_id,amount) VALUES(?,?,?)",
          id,
          ids.get(i),
          amount / ids.size() + (i < amount % ids.size() ? 1 : 0));
  }

  private void settle(String id, String groupId, JsonNode p, long now) {
    long amount = amount(p);
    String from = string(p, "fromId", 36), to = string(p, "toId", 36);
    requireMember(groupId, from);
    requireMember(groupId, to);
    if (from.equals(to)) throw ApiException.bad("Choose two different people.");
    Group group = group(groupId);
    long fromBalance =
        group.members().stream()
            .filter(m -> m.id().equals(from))
            .findFirst()
            .orElseThrow()
            .balance();
    long toBalance =
        group.members().stream().filter(m -> m.id().equals(to)).findFirst().orElseThrow().balance();
    if (amount > Math.min(-fromBalance, toBalance))
      throw ApiException.bad("Balances changed. Refresh and check the outstanding amount.");
    db.update(
        "INSERT INTO settlements(id,group_id,from_id,to_id,amount,created_at) VALUES(?,?,?,?,?,?)",
        id,
        groupId,
        from,
        to,
        amount,
        now);
  }
}
