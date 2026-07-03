import sgMail from "@sendgrid/mail";

/**
 * SendGrid wrapper. Email stays optional: when the API key,
 * sender, or recipients are missing, sends report a clear error
 * instead of failing at startup.
 */

/**
 * @param {{ sendgridApiKey: string, fromAddress: string, recipients: string[] }} config
 */
export function createMailer(config) {
  const enabled =
    config.sendgridApiKey.length > 0 &&
    config.fromAddress.length > 0 &&
    config.recipients.length > 0;
  if (enabled) {
    sgMail.setApiKey(config.sendgridApiKey);
  }

  /**
   * Emails a WOR PDF to the configured recipients.
   * @param {string} controlNumber
   * @param {string} dateLong
   * @param {Buffer} pdfBuffer
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function sendWor(controlNumber, dateLong, pdfBuffer) {
    if (!enabled) {
      return {
        success: false,
        error: "Email is not configured. Set SENDGRID_API_KEY, FROM_ADDRESS, and recipients.",
      };
    }
    try {
      await sgMail.send({
        to: config.recipients,
        from: config.fromAddress,
        subject: `DRONESMOKE Warfighter Observation Report ${controlNumber}`,
        html: [
          "<div style='font-family:sans-serif;color:#1A2018;max-width:600px'>",
          `<h2 style='color:#3E4A2E;margin:0 0 16px'>${controlNumber}</h2>`,
          `<p>The Warfighter Observation Report for ${dateLong} is attached.</p>`,
          "</div>",
        ].join(""),
        attachments: [
          {
            filename: `${controlNumber}.pdf`,
            content: pdfBuffer.toString("base64"),
            type: "application/pdf",
            disposition: "attachment",
          },
        ],
      });
      return { success: true };
    } catch (error) {
      const detail = error?.response?.body?.errors?.[0]?.message;
      const message = detail || error?.message || "Failed to send email.";
      console.error("SendGrid error:", message);
      return { success: false, error: message };
    }
  }

  return { enabled, sendWor };
}
