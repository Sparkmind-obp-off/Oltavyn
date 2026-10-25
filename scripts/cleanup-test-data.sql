-- Removes smoke-test users (*@test.local) and all their data. Run:
-- npx wrangler d1 execute oltavyn-production --remote --file=scripts/cleanup-test-data.sql
DELETE FROM observations WHERE experiment_id IN (SELECT e.id FROM experiments e JOIN workspaces w ON w.id=e.workspace_id JOIN users u ON u.id=w.owner_user_id WHERE u.email LIKE '%@test.local');
DELETE FROM experiments WHERE workspace_id IN (SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email LIKE '%@test.local');
DELETE FROM approvals WHERE reviewer_user_id IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM content_versions WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM content_assets WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM opportunity_evidence WHERE opportunity_id IN (SELECT id FROM opportunities WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.local'));
DELETE FROM opportunities WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM evidence_items WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM workspaces WHERE owner_user_id IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.local');
DELETE FROM users WHERE email LIKE '%@test.local';
DELETE FROM rate_limits;
