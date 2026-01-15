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
                        // REGRA: Ignora Auditora 'Sistema' (conforme Dezembro.csv)
                        const auditora = (row['Auditora'] || '').toLowerCase();
                        // Garante que só entram registros com nota válida
                        return auditora !== 'sistema' && auditora !== '' && row['% Assert'] !== undefined;
                    })
                    .map(row => {
                        // Tratamento de porcentagem: remove '%' e converte ',' em '.'
                        let pct = String(row['% Assert'] || '0').replace('%', '').replace(',', '.').trim();
                        
                        return {
                            data_referencia: this.formatarData(row['Data da Auditoria ']),
                            empresa_nome: row['Empresa'],
                            nome_assistente: row['Assistente'],
                            nome_documento: row['doc_name'],
                            status: row['STATUS'],
                            num_campos: parseInt(row['nº Campos']) || 0,
                            qtd_ok: parseInt(row['Ok']) || 0,
                            qtd_nok: parseInt(row['Nok']) || 0,
                            indice_assertividade: parseFloat(pct) || 0,
                            nome_auditora_raw: row['Auditora']
                            // REMOVIDO: id_assistente (causador do erro PGRST204)
                        };
                    });

                console.log(`✅ [NEXUS] ${listaParaSalvar.length} registros filtrados prontos para envio.`);
                if (listaParaSalvar.length > 0) {
                    await this.enviarLotes(listaParaSalvar);
                } else {
                    alert("Nenhum registro válido encontrado após o filtro 'Anti-Sistema'.");
                }
            }
        });
    },

    formatarData: (d) => {
        if (!d || !d.includes('/')) return new Date().toISOString().split('T')[0];
        const parts = d.split('/');
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    },

    enviarLotes: async function(dados) {
        const TAMANHO_LOTE = 500;
        for (let i = 0; i < dados.length; i += TAMANHO_LOTE) {
            const lote = dados.slice(i, i + TAMANHO_LOTE);
            // Tabela física confirmada: 'assertividade'
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            
            if (error) {
                console.error("❌ Erro técnico no lote:", error);
                alert(`Erro de Coluna: ${error.message}\nVerifique se os nomes das colunas no banco batem com o código.`);
                return;
            }
        }
        alert("✅ Sucesso! Dados importados sem ruído de sistema.");
        if (window.Gestao?.Assertividade?.carregarDados) Gestao.Assertividade.carregarDados();
    }
};