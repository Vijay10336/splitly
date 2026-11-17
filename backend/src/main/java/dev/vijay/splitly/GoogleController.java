package dev.vijay.splitly;

import java.net.URI;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/auth/google")
class GoogleController {
  private final AuthService auth;
  private final JdbcTemplate db;
  private final String clientId, secret, base;
  private final RestClient client =
      RestClient.builder()
          .requestFactory(
              new org.springframework.http.client.SimpleClientHttpRequestFactory() {
                {
                  setConnectTimeout(10000);
                  setReadTimeout(10000);
                }
              })
          .build();

  GoogleController(
      AuthService auth,
      JdbcTemplate db,
      @Value("${app.google-client-id}") String clientId,
      @Value("${app.google-client-secret}") String secret,
      @Value("${app.public-url}") String base) {
    this.auth = auth;
    this.db = db;
    this.clientId = clientId;
    this.secret = secret;
    this.base = base;
  }

  @GetMapping("/config")
  Object config() {
    return Map.of("enabled", !clientId.isBlank() && !secret.isBlank());
  }

  @GetMapping("/start")
  ResponseEntity<?> start(
      @RequestParam String challenge, @RequestParam(defaultValue = "web") String platform) {
    if (clientId.isBlank() || secret.isBlank())
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in has not been configured yet.");
    if (!challenge.matches("[A-Za-z0-9_-]{43}")
        || !java.util.List.of("web", "native").contains(platform))
      throw ApiException.bad("Invalid sign-in request.");
    String state = auth.token(null, "google", 600, platform + ":" + challenge);
    String url =
        UriComponentsBuilder.fromUriString("https://accounts.google.com/o/oauth2/v2/auth")
            .queryParam("client_id", clientId)
            .queryParam("redirect_uri", base + "/api/auth/google/callback")
            .queryParam("response_type", "code")
            .queryParam("scope", "openid email profile")
            .queryParam("state", state)
            .queryParam("prompt", "select_account")
            .build()
            .encode()
            .toUriString();
    return ResponseEntity.status(302).location(URI.create(url)).build();
  }

  @GetMapping("/callback")
  @Transactional
  ResponseEntity<?> callback(
      @RequestParam String state,
      @RequestParam(required = false) String code,
      @RequestParam(required = false) String error) {
    var flow = auth.consume(state, "google");
    String[] extra = ((String) flow.get("extra")).split(":", 2);
    String target = extra[0].equals("native") ? "dev.vijay.splitly://auth" : base + "/";
    if (error != null || code == null)
      return redirect(target, "authError", "Google sign-in was cancelled. Please try again.");
    try {
      var form = new LinkedMultiValueMap<String, String>();
      form.add("client_id", clientId);
      form.add("client_secret", secret);
      form.add("code", code);
      form.add("grant_type", "authorization_code");
      form.add("redirect_uri", base + "/api/auth/google/callback");
      Map<?, ?> tokens =
          client
              .post()
              .uri("https://oauth2.googleapis.com/token")
              .contentType(MediaType.APPLICATION_FORM_URLENCODED)
              .body(form)
              .retrieve()
              .body(Map.class);
      Map<?, ?> profile =
          client
              .get()
              .uri("https://openidconnect.googleapis.com/v1/userinfo")
              .header("Authorization", "Bearer " + tokens.get("access_token"))
              .retrieve()
              .body(Map.class);
      if (!Boolean.TRUE.equals(profile.get("email_verified")))
        throw ApiException.bad("Google email must be verified.");
      String id =
          auth.googleUser(
              (String) profile.get("sub"),
              (String) profile.get("email"),
              profile.get("name") instanceof String name ? name : (String) profile.get("email"));
      String ticket = auth.token(id, "exchange", 120, extra[1]);
      return redirect(target, "code", ticket);
    } catch (org.springframework.web.client.RestClientException e) {
      return redirect(target, "authError", "Google sign-in failed. Please try again.");
    }
  }

  private ResponseEntity<?> redirect(String target, String key, String value) {
    return ResponseEntity.status(302)
        .location(
            UriComponentsBuilder.fromUriString(target)
                .queryParam(key, value)
                .build()
                .encode()
                .toUri())
        .build();
  }
}
