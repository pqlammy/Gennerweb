# Gennerweb Update-Log

## v1.0.0 (2024-01-15)
- 🎉 Erstveröffentlichung der Gennerweb Plattform mit Mitglieder- und Beitragsverwaltung.

## v1.1.0 (2025-10-03)
- 🗑️ Admin Dashboard erhält einen "Alle Einträge löschen" Button inklusive Sicherheitsabfrage.
- ⚙️ Update-Skript erkennt Benutzer, Services & deployt Frontend automatisch.
- 🔄 Erste Version des Markdown-basierten Änderungslogs, das beim Deployment synchronisiert wird.

## v2.0.0 (2025-10-04)
- 🔐 Verbesserter Login-Schutz mit konfigurierbaren Account-Lockouts nach wiederholten Fehlversuchen.
- 🛡️ Hardened Security Headers (COOP, DNS Prefetch Control, strikte CSP) und Validierung starker JWT-Secrets.
- ⚡ Performance-Optimierung: Admin- und User-Seiten werden via React.lazy nachgeladen; Suche & Filter im Dashboard reagieren dank `useDeferredValue` flüssiger.
- 📚 Admin Settings Security Panel & Datenschutzerklärung dokumentieren alle Schutzmassnahmen.

## v2.0.1 (2025-10-04)
- 🚀 Deployment UX: Das Export-Skript synchronisiert `backend/scripts`, damit der automatische Versionsabgleich auf allen Servern funktioniert.
- 🧭 Update-Sicherheit: `full-update.sh` prüft das Sync-Skript vor dem Aufruf und gibt bei Bedarf nur einen Hinweis aus.
- ✅ Erfolgreicher Infrastruktur-Rollout inklusive automatischem Setzen der v2.0.0-Version über das Markdown-Log.
