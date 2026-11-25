# Managing sign-in accounts in Supabase

The full step-by-step guide (with pictures of each step in words, common situations and fixes) is the Claude doc
"GID – Managing sign-in accounts in Supabase (step by step)": https://claude.ai/artifact/JBhEE6z68Q4tnHN7bGMVgp

Quick list (Supabase → SQL Editor → New query → paste one line → change the text inside the quotes → Run):

```sql
select * from private.accounts_list();                                       -- 1. every account, status, devices signed in
select * from private.find_staff('sok');                                     -- 2. find a Staff ID (GID-007)
select private.kick_out('012 345 678');                                      -- 3. sign out everywhere (can sign in again)
select private.block_account('012 345 678');                                 -- 4. switch off + sign out
select private.unblock_account('012 345 678');                               -- 5. switch back on
select private.approve_account('012 345 678', 'GID-007');                    -- 6. approve a waiting sign-up
select private.add_account('012 345 678', 'Sok Dara', 'GID-007', 'Gid2026start');  -- 7. create an account (temporary password)
select private.reset_password('012 345 678', 'Gid2026reset');                -- 8. forgotten password / unlock
```
Answers start with DONE (it worked) or NOT DONE (nothing changed, and why). Installed by supabase/update-v25.sql; only the database owner can run them.
