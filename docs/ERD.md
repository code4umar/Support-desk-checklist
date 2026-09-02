# Support Desk — Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ tickets : "raises (requester)"
    users ||--o{ tickets : "assigned to (assignee)"
    users ||--o{ comments : writes
    users ||--o{ ticket_events : "acts as (actor)"
    tickets ||--o{ comments : has
    tickets ||--o{ ticket_events : has
    tickets ||--o{ ticket_tags : "tagged via"
    tags ||--o{ ticket_tags : "applied via"

    users {
        int id PK
        string email UK
        string password_hash
        string full_name
        users_role_enum role
        timestamptz created_at
    }

    tickets {
        int id PK
        string subject
        text body
        tickets_status_enum status
        tickets_priority_enum priority
        int requester_id FK "NOT NULL, references users.id"
        int assignee_id FK "NULL, references users.id, ON DELETE SET NULL"
        timestamptz due_at
        timestamptz created_at
        timestamptz updated_at
    }

    comments {
        int id PK
        int ticket_id FK "NOT NULL, ON DELETE CASCADE"
        int author_id FK "NOT NULL, references users.id"
        text body
        boolean is_internal "default false"
        timestamptz created_at
    }

    tags {
        int id PK
        string name UK
    }

    ticket_tags {
        int ticket_id PK, FK "ON DELETE CASCADE"
        int tag_id PK, FK "ON DELETE CASCADE"
    }

    ticket_events {
        int id PK
        int ticket_id FK "NOT NULL, ON DELETE CASCADE"
        int actor_id FK "NULL, references users.id"
        tickets_status_enum from_status "nullable"
        tickets_status_enum to_status "nullable"
        text note "nullable"
        timestamptz created_at
    }
```

## Cardinality notes

- `users → tickets` (requester): **mandatory** on the ticket side — every ticket has exactly one requester, and a user may have raised many tickets or none. `requester_id` is `NOT NULL`.
- `users → tickets` (assignee): **optional** — a ticket may be unassigned. `assignee_id` is nullable, `ON DELETE SET NULL` (if the assigned agent is ever removed, the ticket becomes unassigned rather than being deleted).
- `tickets → comments`: mandatory, `ON DELETE CASCADE` — deleting a ticket deletes its comments.
- `tickets → ticket_events`: mandatory, `ON DELETE CASCADE` — deleting a ticket deletes its audit trail with it.
- `tickets ↔ tags` via `ticket_tags`: many-to-many, composite primary key `(ticket_id, tag_id)`, both sides `ON DELETE CASCADE`.
- `ticket_events.actor_id`: **nullable** — reserved for a system-generated event with no human actor; in practice every event in this app has an actor.
