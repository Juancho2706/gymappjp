-- El trigger generate_invite_code() corre BEFORE INSERT y siempre sobreescribe este valor.
-- El DEFAULT es necesario para que los tipos TypeScript generados marquen invite_code
-- como opcional en INSERT (de lo contrario el codegen la exige y rompe inserts existentes).
ALTER TABLE coaches ALTER COLUMN invite_code SET DEFAULT '';
