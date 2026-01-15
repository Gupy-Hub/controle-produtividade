window.Gestao = window.Gestao || {};
Gestao.ImportacaoAssertividade = {
    processarCSV: async function(file) {
        if (!file) return;
        console.log("📂 [NEXUS] Processando: " + file.name);
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const listaParaSalvar = results.data
                    .filter(row => {
                        // REGRA: Ignora Auditora 'Sistema' e linhas sem nota
                        const auditora = (row['Auditora'] || '').toLowerCase();
                        return auditora !== 'sistema' && row['% Assert'] !== '';
                    })
                    .map(row => ({
                        data_referencia: this.formatarData(row['Data da Auditoria ']),
                        empresa_nome: row['Empresa'],
                        nome_assistente: row['Assistente'],
                        nome_documento: row['doc_name'],
                        status: row['STATUS'],
                        num_campos: parseInt(row['nº Campos']) || 0,
                        qtd_ok: parseInt(row['Ok']) || 0,
                        qtd_nok: parseInt(row['Nok']) || 0,
                        indice_assertividade: parseFloat((row['% Assert'] || '0').replace('%', '').replace(',', '.')),
                        nome_auditora_raw: row['Auditora'],
                        id_assistente: String(row['id_assistente'])
                    }));

                if (listaParaSalvar.length > 0) {
                    await this.enviarLotes(listaParaSalvar);
                }
            }
        });
    },

    formatarData: (d) => {
        const parts = d.split('/');
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : d;
    },

    enviarLotes: async function(dados) {
        const TAMANHO_LOTE = 500;
        for (let i = 0; i < dados.length; i += TAMANHO_LOTE) {
            const lote = dados.slice(i, i + TAMANHO_LOTE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (error) {
                console.error("❌ Erro no lote:", error);
                alert("Erro: " + error.message);
                return;
            }
        }
        alert("✅ Importação de " + dados.length + " registros concluída!");
    }
};