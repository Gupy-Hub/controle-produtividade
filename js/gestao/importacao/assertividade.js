window.Gestao = window.Gestao || {};

Gestao.ImportacaoAssertividade = {
    /**
     * Processa o arquivo CSV de assertividade
     * @param {File} file - Arquivo vindo do input
     */
    processarCSV: async function(file) {
        if (!file) {
            alert("Por favor, selecione um arquivo CSV.");
            return;
        }
        
        console.log("📂 [NEXUS] Iniciando processamento do CSV...");
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true, // Converte números automaticamente
            complete: async (results) => {
                const rows = results.data;
                const listaParaSalvar = [];

                console.log(`📊 Total de linhas lidas: ${rows.length}`);

                rows.forEach((row, index) => {
                    // 1. IDENTIFICAÇÃO DA AUDITORA E FILTRO DE SISTEMA
                    // Removemos quem é "Sistema" pois não deve ter % na média
                    const auditora = (row['Auditora'] || '').toString().trim();
                    if (auditora.toLowerCase() === 'sistema' || auditora === '') {
                        return; 
                    }

                    // 2. TRATAMENTO DA PORCENTAGEM (0 a 100)
                    let pctRaw = row['% Assert'];
                    let valorAssert = 0;

                    if (typeof pctRaw === 'string') {
                        valorAssert = parseFloat(pctRaw.replace('%', '').replace(',', '.'));
                    } else {
                        valorAssert = parseFloat(pctRaw);
                    }

                    // Só entra na lista se for um número válido (0-100)
                    if (isNaN(valorAssert)) return;

                    // 3. MAPEAMENTO PARA O BANCO DE DADOS
                    listaParaSalvar.push({
                        data_referencia: this.formatarData(row['Data da Auditoria ']),
                        empresa_nome: row['Empresa'],
                        nome_assistente: row['Assistente'],
                        nome_documento: row['doc_name'],
                        status: row['STATUS'],
                        num_campos: parseInt(row['nº Campos']) || 0,
                        qtd_ok: parseInt(row['Ok']) || 0,
                        qtd_nok: parseInt(row['Nok']) || 0,
                        indice_assertividade: valorAssert,
                        nome_auditora_raw: auditora,
                        id_assistente: row['id_assistente']?.toString()
                    });
                });

                if (listaParaSalvar.length > 0) {
                    await this.enviarParaSupabase(listaParaSalvar);
                } else {
                    alert("Nenhum registro válido (com auditora humana e nota entre 0-100) foi encontrado.");
                }
            },
            error: (err) => {
                console.error("❌ Erro no PapaParse:", err);
                alert("Erro ao ler o arquivo CSV.");
            }
        });
    },

    /**
     * Converte DD/MM/YYYY para YYYY-MM-DD
     */
    formatarData: function(dataStr) {
        if (!dataStr || !dataStr.includes('/')) return new Date().toISOString().split('T')[0];
        const [d, m, y] = dataStr.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    },

    /**
     * Envia os dados para a tabela física 'assertividade'
     */
    enviarParaSupabase: async function(dados) {
        try {
            console.log(`🚀 [NEXUS] Enviando ${dados.length} registros para o banco...`);
            
            // Dividindo em lotes de 1000 para evitar erro de payload do Supabase
            const tamanhoLote = 1000;
            for (let i = 0; i < dados.length; i += tamanhoLote) {
                const lote = dados.slice(i, i + tamanhoLote);
                
                // IMPORTANTE: Alterado para 'assertividade' (tabela física provável)
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .insert(lote);

                if (error) throw error;
                console.log(`✅ Lote ${Math.floor(i/tamanhoLote) + 1} enviado.`);
            }

            alert("Importação concluída com sucesso!");
            
            // Recarrega a tela se a função existir
            if (window.Gestao && Gestao.Assertividade && Gestao.Assertividade.carregarDados) {
                Gestao.Assertividade.carregarDados();
            }

        } catch (err) {
            console.error("❌ Erro técnico no Insert:", err);
            alert(`Erro ao salvar no banco: ${err.message || 'Verifique se a tabela "assertividade" existe.'}`);
        }
    }
};