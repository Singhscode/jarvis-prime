# Changelog

All notable changes to JARVIS PRIME are documented in this file.

## [0.6.0] — 2026-07-15

### Added

- Owner-scoped Client Management at `/api/crm`.
- CRM Lead → Client conversion that preserves the CRM lead history.
- Client-contact listing, creation, update, and detachment operations.
- `crm_clients`, client relationships on CRM contacts and leads, and an atomic PostgreSQL conversion function.

### Changed

- Active CRM lead listings exclude leads already converted to clients.
- Client deletion clears client associations and makes the preserved lead active again.

### Security

- All client and client-contact access requires existing JWT authentication and is scoped to `owner_user_id`.

### Architecture

- Reused the CRM module and contacts table.
- Avoided generic CRUD, generic repositories, and unnecessary abstractions.

[0.6.0]: https://github.com/Singhscode/jarvis-prime/releases/tag/v0.6.0-client-management
