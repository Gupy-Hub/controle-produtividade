/**
 * PERFORMANCE PRO - PROCESSAMENTO DE CSV (VERSÃO FINAL)
 * Mapeado para as colunas: nome_documento, qtd_ok, qtd_nok, num_campos
 */

const ImportadorAssertividade = {
    async processarArquivo(file) {
        console.log(`%c 📑 Iniciando processamento: ${file.name}`, "color: #2563eb; font-weight: bold;");
        
        const leitor = new FileReader();
        leitor.onload = async (e) => {
            const texto = e.target.result;
            const linhas = texto.split(/\r?\n/);
            
            // 1. Identificação do Cabeçalho (Pode ser ; ou , dependendo do CSV)
            const delimitador = linhas[0].includes(';') ? ';' : ',';
            const cabecalho = linhas[0].toLowerCase().split(delimitador);
            
            const registros = [];
            
            // 2. Iteração sobre as linhas (Pula o cabeçalho)
            for (let i = 1; i < linhas.length; i++) {
                if (!linhas[i].trim()) continue;
                
                const col = linhas[i].split(delimitador);
                
                // Mapeamento baseado nas colunas reais do seu banco
                const item = {
                    nome_documento: col[cabecalho.indexOf('documento')] || col[cabecalho.indexOf('nome_documento')],
                    data_auditoria: this.formatarData(col[cabecalho.indexOf('data')]),
                    qtd_ok: parseInt(col[cabecalho.indexOf('ok')]) || 0,
                    qtd_nok: parseInt(col[cabecalho.indexOf('nok')]) || 0,
                    num_campos: parseInt(col[cabecalho.indexOf('campos')]) || 0,
                    usuario_id: parseInt(col[cabecalho.indexOf('usuario_id')]) || null,
                    status: 'Finalizado'
                };

                if (item.nome_documento) registros.push(item);
            }

            // 3. Upsert no Supabase (Usa a constraint assertividade_documento_unique)
            const { error } = await Sistema.supabase
                .from('assertividade')
                .upsert(registros, { onConflict: 'nome_documento,data_auditoria' });

            if (error) {
                console.error("Erro no Banco:", error);
                alert("Falha ao salvar: " + error.message);
            } else {
                alert(`Sucesso! ${registros.length} registros processados do arquivo ${file.name}`);
            }
        };
        leitor.readAsText(file, 'ISO-8859-1');
    },

    formatarData(data) {
        if (!data) return new Date().toISOString().split('T')[0];
        // Converte DD/MM/YYYY para YYYY-MM-DD
        const d = data.split('/');
        return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : data;
    }
};