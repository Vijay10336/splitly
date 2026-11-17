package dev.vijay.splitly;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class Security {
  @Bean
  BCryptPasswordEncoder passwords() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  SecurityFilterChain chain(
      HttpSecurity http, AuthService auth, @Value("${app.allowed-origins}") String origins)
      throws Exception {
    CorsConfiguration cors = new CorsConfiguration();
    cors.setAllowedOrigins(Arrays.asList(origins.split(",")));
    cors.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
    cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", cors);
    return http.csrf(c -> c.disable())
        .cors(c -> c.configurationSource(source))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(HttpMethod.OPTIONS, "/**")
                    .permitAll()
                    .requestMatchers("/api/auth/**", "/api/health")
                    .permitAll()
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .permitAll())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                    (req, res, ex) -> {
                      res.setStatus(401);
                      res.setContentType("application/json");
                      res.getWriter()
                          .write("{\"error\":\"Please sign in to sync your expenses.\"}");
                    }))
        .addFilterBefore(new AccessFilter(auth), UsernamePasswordAuthenticationFilter.class)
        .build();
  }

  static class AccessFilter extends OncePerRequestFilter {
    private final AuthService auth;
    private final Map<String, Window> attempts = new ConcurrentHashMap<>();

    record Window(long start, int count) {}

    AccessFilter(AuthService auth) {
      this.auth = auth;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest req, HttpServletResponse res, FilterChain chain)
        throws ServletException, IOException {
      if (req.getRequestURI().startsWith("/api/auth/")) {
        long now = System.currentTimeMillis();
        attempts.entrySet().removeIf(e -> now - e.getValue().start() > 900_000);
        Window w =
            attempts.compute(
                req.getRemoteAddr(),
                (key, old) ->
                    old == null ? new Window(now, 1) : new Window(old.start(), old.count() + 1));
        if (w.count() > 100) {
          res.setStatus(429);
          res.setContentType("application/json");
          res.getWriter().write("{\"error\":\"Too many attempts. Try again in 15 minutes.\"}");
          return;
        }
      }
      String header = req.getHeader("Authorization");
      if (header != null && header.startsWith("Bearer ")) {
        var user = auth.session(header.substring(7));
        if (user != null)
          SecurityContextHolder.getContext()
              .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
      }
      chain.doFilter(req, res);
    }
  }
}
