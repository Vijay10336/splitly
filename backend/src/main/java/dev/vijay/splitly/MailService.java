package dev.vijay.splitly;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.MessagingException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.*;
import org.springframework.stereotype.Service;

@Service
class MailService {
  private final JavaMailSender sender;
  private final ObjectMapper json;
  private final String from;

  MailService(JavaMailSender sender, ObjectMapper json, @Value("${app.mail-from}") String from) {
    this.sender = sender;
    this.json = json;
    this.from = from;
  }

  void send(String to, String subject, String text, Object backup) {
    try {
      var mail = sender.createMimeMessage();
      var helper = new MimeMessageHelper(mail, backup != null, "UTF-8");
      helper.setFrom(from);
      helper.setTo(to);
      helper.setSubject(subject);
      helper.setText(text);
      if (backup != null)
        helper.addAttachment(
            "splitly-backup.json",
            new ByteArrayResource(json.writerWithDefaultPrettyPrinter().writeValueAsBytes(backup)),
            "application/json");
      sender.send(mail);
    } catch (MessagingException | java.io.IOException e) {
      throw new org.springframework.mail.MailSendException("Unable to prepare email", e);
    }
  }
}
