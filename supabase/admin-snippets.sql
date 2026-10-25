-- Copy one of these into the Supabase SQL Editor, change the values in
-- quotes, and click Run.

-- Add a club. The id is a short name with dashes, used to link its events.
insert into clubs (id, name, website)
  values ('pca-first-settlers', 'PCA First Settlers Region', 'https://www.fsrpca.org');

-- Let someone edit one club's events. Create their login first under
-- Authentication -> Users -> Add user, then:
insert into club_admins (user_id, club_id)
  select id, 'just-track-it' from auth.users where email = 'person@example.com';

-- Let someone edit every club (Redline Techniques staff):
insert into platform_admins (user_id)
  select id from auth.users where email = 'person@example.com';

-- Stop someone editing a club:
delete from club_admins
  where club_id = 'just-track-it'
  and user_id = (select id from auth.users where email = 'person@example.com');
