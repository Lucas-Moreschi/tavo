-- A coluna permanece anulável para importar os arquivos da versão anterior
-- sem apagar seus metadados, referências ou endereços públicos da API.
ALTER TABLE uploaded_files ADD COLUMN data bytea;
ALTER TABLE uploaded_files ADD CONSTRAINT uploaded_files_data_size
  CHECK (data IS NULL OR octet_length(data) BETWEEN 13 AND 3145728);
