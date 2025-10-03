# E-Mail Bestätigung konfigurieren

Der Backend-Server verschickt nach jeder erfolgreich erfassten Contribution automatisch eine Bestätigungsmail. Damit das funktioniert, müssen die folgenden Umgebungsvariablen gesetzt werden (z. B. in deiner `.env` oder im Deployment-Setup):

```
SMTP_HOST=gibelguuger.ch
SMTP_PORT=465
SMTP_USER=genner@gibelguuger.ch
SMTP_PASSWORD=<dein_smtp_passwort>
MAIL_FROM=genner@gibelguuger.ch
ENABLE_OUTBOUND_MAIL=true
```

**Hinweise**

- `SMTP_PASSWORD` ist das Passwort für den Mail-Account `genner@gibelguuger.ch`. Teile dieses Passwort nicht im Repository, sondern hinterlege es nur in der jeweiligen Deployment-Umgebung.
- `MAIL_FROM` legt die Absenderadresse fest. Wenn du nichts angibst, wird automatisch `SMTP_USER` verwendet.
- Mit `ENABLE_OUTBOUND_MAIL=false` kannst du den Versand deaktivieren, ohne Code zu ändern.

## E-Mail-Text anpassen

Der Inhalt der E-Mail liegt als HTML-Template unter

```
backend/templates/contribution-confirmation.html
```

Platzhalter wie `{{firstName}}`, `{{amount}}` oder `{{paymentMethod}}` werden beim Versand automatisch ersetzt. Du kannst das Template frei bearbeiten, solange die Platzhalter erhalten bleiben.

## Abhängigkeiten installieren

Für den Versand verwenden wir `nodemailer`. Falls du die Backend-Abhängigkeiten neu installierst, denke daran im Verzeichnis `backend` einmal `npm install` auszuführen, damit `nodemailer` im `node_modules`-Ordner liegt.

## Fehlerbehandlung

- Wenn die Zugangsdaten fehlen oder `nodemailer` nicht verfügbar ist, fährt der Server ohne E-Mail-Versand hoch und loggt einen Hinweis.
- Auftretende Versandfehler werden protokolliert, blockieren aber nicht die eigentliche Contribution-Erfassung.
