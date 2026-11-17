package dev.vijay.splitly;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AuthService {
  record User(String id, String email, String name, boolean verified) {}

  private final JdbcTemplate db;
  private final BCryptPasswordEncoder passwords;
  private final MailService mail;
  private final String publicUrl;
  private final String dummyHash;
  private static final SecureRandom RANDOM = new SecureRandom();

  AuthService(
      JdbcTemplate db,
      BCryptPasswordEncoder passwords,
      MailService mail,
      @Value("${app.public-url}") String publicUrl) {
    this.db = db;
    this.passwords = passwords;
    this.mail = mail;
    this.publicUrl = publicUrl;
    this.dummyHash = passwords.encode(random());
  }

  static String random() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  static String email(String value) {
    if (value == null
        || value.length() > 254
        || !value.trim().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
      throw ApiException.bad("Enter a valid email address.");
    return value.trim().toLowerCase(Locale.ROOT);
  }

  static String text(String value, int max) {
    if (value == null || value.isBlank() || value.trim().length() > max)
      throw ApiException.bad("Please check the entered values.");
    return value.trim();
  }

  private void password(String value) {
    if (value == null || value.length() < 10 || value.getBytes(StandardCharsets.UTF_8).length > 72)
      throw ApiException.bad(
          "Use a password with at least 10 characters and at most 72 UTF-8 bytes.");
  }

  User user(String id) {
    return db.queryForObject(
        "SELECT * FROM app_users WHERE id=?",
        (r, n) ->
            new User(
                r.getString("id"),
                r.getString("email"),
                r.getString("name"),
                r.getBoolean("verified")),
        id);
  }

  String token(String id, String kind, long seconds, String extra) {
    db.update("DELETE FROM auth_tokens WHERE expires_at < ?", Instant.now().getEpochSecond());
    String raw = random();
    db.update(
        "INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,extra) VALUES(?,?,?,?,?)",
        hash(raw),
        id,
        kind,
        Instant.now().getEpochSecond() + seconds,
        extra);
    return raw;
  }

  User session(String raw) {
    var ids =
        db.queryForList(
            "SELECT user_id FROM auth_tokens WHERE token_hash=? AND kind='session' AND"
                + " expires_at>?",
            String.class,
            hash(raw),
            Instant.now().getEpochSecond());
    return ids.isEmpty() ? null : user(ids.get(0));
  }

  Map<String, Object> loginResult(String id) {
    return Map.of("token", token(id, "session", 604800, null), "user", user(id));
  }

  @Transactional
  Map<String, Object> signup(String name, String email, String password) {
    String normalized = email(email);
    password(password);
    name = text(name, 80);
    if (!db.queryForList("SELECT id FROM app_users WHERE email=?", normalized).isEmpty())
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Unable to create account. Try signing in or resetting your password.");
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO app_users(id,email,name,password_hash,verified) VALUES(?,?,?,?,FALSE)",
        id,
        normalized,
        name,
        passwords.encode(password));
    sendVerification(user(id));
    return loginResult(id);
  }

  @Transactional
  Map<String, Object> login(String email, String password) {
    String normalized = email(email);
    var rows = db.queryForList("SELECT id,password_hash FROM app_users WHERE email=?", normalized);
    String stored = rows.isEmpty() ? null : (String) rows.get(0).get("password_hash");
    boolean matched =
        passwords.matches(password == null ? "" : password, stored == null ? dummyHash : stored);
    if (!matched || stored == null)
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
    return loginResult((String) rows.get(0).get("id"));
  }

  @Transactional
  void forgot(String email) {
    var ids = db.queryForList("SELECT id FROM app_users WHERE email=?", String.class, email(email));
    if (!ids.isEmpty()) {
      String raw = token(ids.get(0), "reset", 1800, null);
      mail.send(
          email(email),
          "Reset your Splitly password",
          "Reset your password within 30 minutes:\n" + publicUrl + "/?reset=" + raw,
          null);
    }
  }

  @Transactional
  void sendVerification(User user) {
    if (user.verified()) return;
    String raw = token(user.id(), "verify", 86400, null);
    mail.send(
        user.email(),
        "Verify your Splitly email",
        "Verify your email within 24 hours:\n" + publicUrl + "/?verify=" + raw,
        null);
  }

  // Lock token consumption so concurrent requests cannot redeem a link twice.
  Map<String, Object> consume(String raw, String kind) {
    var rows =
        db.queryForList(
            "SELECT * FROM auth_tokens WHERE token_hash=? AND kind=? AND expires_at>? FOR UPDATE",
            hash(raw),
            kind,
            Instant.now().getEpochSecond());
    if (rows.isEmpty()) throw ApiException.bad("This link has expired or has already been used.");
    db.update("DELETE FROM auth_tokens WHERE token_hash=?", hash(raw));
    return rows.get(0);
  }

  @Transactional
  void reset(String raw, String password) {
    password(password);
    String id = (String) consume(raw, "reset").get("user_id");
    db.update(
        "UPDATE app_users SET password_hash=?,verified=TRUE WHERE id=?",
        passwords.encode(password),
        id);
    db.update("DELETE FROM auth_tokens WHERE user_id=?", id);
  }

  @Transactional
  void verify(String raw) {
    String id = (String) consume(raw, "verify").get("user_id");
    db.update("UPDATE app_users SET verified=TRUE WHERE id=?", id);
    db.update("DELETE FROM auth_tokens WHERE user_id=? AND kind='verify'", id);
  }

  void logout(String token) {
    db.update("DELETE FROM auth_tokens WHERE token_hash=?", hash(token));
  }

  @Transactional
  String googleUser(String sub, String email, String name) {
    String normalized = email(email);
    var linked = db.queryForList("SELECT id FROM app_users WHERE google_sub=?", String.class, sub);
    if (!linked.isEmpty()) return linked.get(0);
    var existing =
        db.queryForList("SELECT id,verified FROM app_users WHERE email=? FOR UPDATE", normalized);
    if (!existing.isEmpty()) {
      String id = (String) existing.get(0).get("id");
      // A pre-created unverified password must not survive Google's proof of mailbox ownership.
      if (!Boolean.TRUE.equals(existing.get(0).get("verified"))) {
        db.update("UPDATE app_users SET password_hash=NULL WHERE id=?", id);
        db.update("DELETE FROM auth_tokens WHERE user_id=?", id);
      }
      db.update("UPDATE app_users SET google_sub=?,verified=TRUE WHERE id=?", sub, id);
      return id;
    }
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO app_users(id,email,name,verified,google_sub) VALUES(?,?,?,TRUE,?)",
        id,
        normalized,
        text(name, 80),
        sub);
    return id;
  }

  @Transactional
  Map<String, Object> exchange(String raw, String verifier) {
    var row = consume(raw, "exchange");
    String challenge =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(HexFormat.of().parseHex(hash(verifier)));
    if (!MessageDigest.isEqual(
        challenge.getBytes(StandardCharsets.UTF_8),
        ((String) row.get("extra")).getBytes(StandardCharsets.UTF_8)))
      throw ApiException.bad("Google sign-in could not be verified. Please start again.");
    return loginResult((String) row.get("user_id"));
  }
}
