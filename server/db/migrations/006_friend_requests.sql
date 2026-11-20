-- Žádost o přátelství podle e-mailu. Adresát nemusí mít účet: žádost uvidí po prvním přihlášení.
-- Odesílatel se nedozví, zda e-mail patří k účtu. Žádost platí 30 dní (hlídá to dotaz).

create table friend_requests (
  id text primary key,
  from_user text not null references users (id) on delete cascade,
  -- E-mail adresáta malými písmeny.
  to_email text not null,
  created_at timestamptz not null default now(),
  unique (from_user, to_email)
);
create index friend_requests_email on friend_requests (to_email);
