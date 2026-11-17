package dev.vijay.splitly;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
class LedgerController {
  private final LedgerService ledger;
  private final MailService mail;
  private final AuthService auth;
  private final JdbcTemplate db;

  LedgerController(LedgerService ledger, MailService mail, AuthService auth, JdbcTemplate db) {
    this.ledger = ledger;
    this.mail = mail;
    this.auth = auth;
    this.db = db;
  }

  @GetMapping("/api/health")
  Object health() {
    db.queryForObject("SELECT 1", Integer.class);
    return Map.of("status", "ok");
  }

  @GetMapping("/api/state")
  Object state(@AuthenticationPrincipal AuthService.User user) {
    return ledger.state(user);
  }

  @PostMapping("/api/commands")
  Object command(
      @AuthenticationPrincipal AuthService.User user, @RequestBody LedgerService.Command command) {
    ledger.command(user, command);
    return Map.of("ok", true);
  }

  @PostMapping("/api/backup/email")
  @Transactional
  Object backup(@AuthenticationPrincipal AuthService.User current) {
    AuthService.User user = auth.user(current.id());
    if (!user.verified())
      throw new ApiException(HttpStatus.FORBIDDEN, "Verify your email before sending a backup.");
    db.queryForMap("SELECT id FROM app_users WHERE id=? FOR UPDATE", user.id());
    if (!db.queryForList(
            "SELECT token_hash FROM auth_tokens WHERE user_id=? AND kind='backup' AND expires_at>?",
            user.id(),
            Instant.now().getEpochSecond())
        .isEmpty())
      throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS, "A backup was recently sent. Try again in one minute.");
    var snapshot = ledger.state(user);
    mail.send(
        user.email(),
        "Your Splitly backup",
        "Your expense backup is attached as JSON. Keep it somewhere safe. Amounts are stored in"
            + " minor currency units (for example, paise or cents).",
        snapshot);
    auth.token(user.id(), "backup", 60, null);
    return Map.of("message", "Backup sent to " + user.email());
  }
}
