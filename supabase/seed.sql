insert into public.profiles (id, username, display_name, avatar_url, bankroll, exposure)
values
  ('11111111-1111-4111-8111-111111111111', 'mara', 'Mara', 'https://images.example.com/mara.png', 1000, 0),
  ('22222222-2222-4222-8222-222222222222', 'sarah', 'Sarah', 'https://images.example.com/sarah.png', 1000, 0)
on conflict do nothing;
