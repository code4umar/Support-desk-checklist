import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Sends email through Resend's HTTP API. Needs RESEND_API_KEY in .env.
// It never throws: a failed email must not break the request that triggered it.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(message: MailMessage): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set, so no email was sent');
      return false;
    }
    const from = process.env.EMAIL_FROM || 'Deskly <onboarding@resend.dev>';

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.error(`Resend answered ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Could not reach Resend: ${(err as Error).message}`);
      return false;
    }
  }
}
