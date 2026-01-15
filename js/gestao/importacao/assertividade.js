window.Gestao = window.Gestao || {};
Gestao.ImportacaoAssertividade = {
    processarCSV: async function(file) {
        if (!file) return;
        console.log("📂 [NEXUS] Processando arquivo: " + file.name);
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const listaParaSalvar = results.data
                    .filter(row => {
                        // REGRA: Ignora Auditora 'Sistema' e garante que existe nota
                        const auditora = (row['Auditora'] || '').toLowerCase();
                        const temNota = row['% Assert'] !== undefined && row['% Assert'] !== null;
                        return auditora !== 'sistema' && auditora !== '' && temNota;
                    })
                    .map(row => {
                        // Conversão da porcentagem (ex: "91,89%" -> 91.89)
                        let pctStr = String(row['% Assert'] || '0').replace('%', '').replace(',', '.').trim();
                        let pctValor = parseFloat(pctStr) || 0;

                        // MAPEAMENTO EXATO COM AS COLUNAS DA TABELA 'assertividade'
                        return {
                            data_referencia: this.formatarData(row['Data da Auditoria ']),
                            empresa_nome: row['Empresa'],
                            nome_assistente: row['Assistente'],
                            nome_documento: row['doc_name'],
                            status: row['STATUS'],
                            num_campos: parseInt(row['nº Campos']) || 0,
                            qtd_ok: parseInt(row['Ok']) || 0,
                            qtd_nok: parseInt(row['Nok']) || 0,
                            porcentagem: pctValor, // Nome correto conforme sua lista
                            nome_auditora_raw: row['Auditora'],
                            observacao: row['Apontamentos/obs'] || ''
                        };
                    });

                console.log(`✅ [NEXUS] ${listaParaSalvar.length} registros validados para envio.`);
                
                if (listaParaSalvar.length > 0) {
                    await this.enviarLotes(listaParaSalvar);
                } else {
                    alert("Nenhum registro válido (não-sistema) encontrado.");
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
            
            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);
            
            if (error) {
                console.error("❌ Erro técnico no lote:", error);
                alert(`Erro no banco: ${error.message}`);
                return;
            }
        }
        alert(`✅ Sucesso! ${dados.length} registros importados na tabela 'assertividade'.`);
        if (window.Gestao?.Assertividade?.carregarDados) Gestao.Assertividade.carregarDados();
    }
};