-- A credencial é global, portanto uma senha provisória restringe todos os vínculos.
ALTER TABLE "user" ADD COLUMN credential_temporary boolean NOT NULL DEFAULT false;
UPDATE "user" u SET credential_temporary=true WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.must_change_password=true);
