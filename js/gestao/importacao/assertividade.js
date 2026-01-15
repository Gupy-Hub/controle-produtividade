window.Gestao = window.Gestao || {};
Gestao.ImportacaoAssertividade = {
    processarCSV: async function(file) {
        if (!file) return;
        
        console.log("📂 [NEXUS] Iniciando processamento do CSV...");
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const text = e.target.result;
            // PapaParse é mais robusto para lidar com quebras de linha e vírgulas dentro de aspas
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data;
                    const listaParaSalvar = [];

                    rows.forEach(row => {
                        // Mapeamento baseado no cabeçalho do seu CSV
                        const auditora = row['Auditora'] || '';
                        const pctRaw = row['% Assert'] || '';
                        
                        // DIRETIVA: Ignorar registros onde a auditora é "Sistema"
                        if (auditora.toLowerCase().includes('sistema')) return;

                        // Validação de nota (0 a 100)
                        let val = parseFloat(pctRaw.replace('%', '').replace(',', '.'));

                        if (!isNaN(val) && val >= 0 && val <= 100) {
                            listaParaSalvar.push({
                                data_referencia: this.formatarData(row['Data da Auditoria ']),
                                empresa_nome: row['Empresa'],
                                nome_assistente: row['Assistente'],
                                nome_documento: row['doc_name'],
                                status: row['STATUS'],
                                num_campos: parseInt(row['nº Campos']) || 0,
                                qtd_ok: parseInt(row['Ok']) || 0,
                                qtd_nok: parseInt(row['Nok']) || 0,
                                indice_assertividade: val,
                                nome_auditora_raw: auditora,
                                id_assistente: row['id_assistente']
                            });
                        }
                    });

                    if (listaParaSalvar.length > 0) {
                        await this.enviarParaSupabase(listaParaSalvar);
                    } else {
                        alert("Nenhum dado válido (ou não-sistema) encontrado no arquivo.");
                    }
                }
            });
        };
        reader.readAsText(file);
    },

    formatarData: function(dataStr) {
        if (!dataStr) return new Date().toISOString().split('T')[0];
        const [d, m, y] = dataStr.split('/');
        return `${y}-${m}-${d}`;
    },

    enviarParaSupabase: async function(dados) {
        try {
            console.log(`🚀 Enviando ${dados.length} registros...`);
            const { error } = await Sistema.supabase
                .from('auditorias') // Certifique-se que o nome da tabela destino é este
                .insert(dados);

            if (error) throw error;

            alert("Importação concluída com sucesso!");
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregarDados();
            }
        } catch (err) {
            console.error("❌ Erro no Insert:", err);
            alert("Erro ao salvar no banco: " + err.message);
        }
    }
};