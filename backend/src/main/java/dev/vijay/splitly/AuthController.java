package dev.vijay.splitly;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
class AuthController {
  private final AuthService auth;

  AuthController(AuthService auth) {
    this.auth = auth;
  }

  record Credentials(
      @NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 100) String password) {}

  record Signup(
      @NotBlank @Size(max = 80) String name,
      @NotBlank @Size(max = 254) String email,
      @NotBlank @Size(max = 100) String password) {}

  record Email(@NotBlank @Size(max = 254) String email) {}

  record Reset(
      @NotBlank @Size(max = 100) String token, @NotBlank @Size(max = 100) String password) {}

  record Token(@NotBlank @Size(max = 100) String token) {}

  record Exchange(
      @NotBlank @Size(max = 100) String code,
      @NotBlank @Size(min = 43, max = 128) String verifier) {}

  @PostMapping("/signup")
  Object signup(@Valid @RequestBody Signup r) {
    return auth.signup(r.name(), r.email(), r.password());
  }

  @PostMapping("/login")
  Object login(@Valid @RequestBody Credentials r) {
    return auth.login(r.email(), r.password());
  }

  @PostMapping("/forgot")
  Object forgot(@Valid @RequestBody Email r) {
    auth.forgot(r.email());
    return Map.of("message", "If the account exists, a reset link is on its way.");
  }

  @PostMapping("/reset")
  Object reset(@Valid @RequestBody Reset r) {
    auth.reset(r.token(), r.password());
    return Map.of("message", "Password updated. Please sign in.");
  }

  @PostMapping("/verify")
  Object verify(@Valid @RequestBody Token r) {
    auth.verify(r.token());
    return Map.of("message", "Email verified. You can now share groups and email backups.");
  }

  @PostMapping("/resend-verification")
  Object resend(@AuthenticationPrincipal AuthService.User user) {
    if (user == null)
      throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Please sign in.");
    auth.sendVerification(user);
    return Map.of("message", "Verification email sent.");
  }

  @PostMapping("/google/exchange")
  Object exchange(@Valid @RequestBody Exchange r) {
    return auth.exchange(r.code(), r.verifier());
  }

  @PostMapping("/logout")
  Object logout(@RequestHeader(value = "Authorization", defaultValue = "") String header) {
    if (header.startsWith("Bearer ")) auth.logout(header.substring(7));
    return Map.of("ok", true);
  }
}
