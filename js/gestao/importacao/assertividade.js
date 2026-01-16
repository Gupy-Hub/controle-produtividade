// Garante namespace
window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            this.lerCSV(file).finally(() => {
                input.value = ''; 
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.classList.remove('cursor-not-allowed', 'opacity-75');
                }
            });
        }
    },

    lerCSV: function(file) {
        return new Promise((resolve) => {
            console.log("📂 [Importacao] Iniciando leitura via PapaParse...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.log(`📊 Linhas lidas: ${results.data.length}`);
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro PapaParse:", error);
                    alert("Falha ao ler o arquivo CSV. Verifique a codificação.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];
        const mapaDuplicatas = new Map(); // Para deduplicar dentro do próprio CSV (última versão ganha)

        console.log("🛠️ Tratando dados e removendo duplicatas internas...");

        for (const linha of linhas) {
            // Validação mínima
            if (!linha['Assistente']) continue;

            // 1. Tratamento de Data
            const dataRaw = linha['Data da Auditoria '] || linha['Data da Auditoria'] || ''; 
            let dataFmt = null;
            if (dataRaw && dataRaw.includes('/')) {
                const [d, m, y] = dataRaw.trim().split('/');
                dataFmt = `${y}-${m}-${d}`;
            } else {
                dataFmt = new Date().toISOString().split('T')[0];
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            // Chave Única Lógica (Business Key)
            const chaveUnica = `${linha['Assistente']}-${dataFmt}-${linha['Empresa']}-${linha['doc_name']}`;

            const objeto = {
                // --- CHAVES E DATAS ---
                usuario_id: idAssistente,
                data_auditoria: dataFmt,
                data_referencia: dataFmt,
                created_at: new Date().toISOString(), // Atualizará a data de criação no upsert se não excluído

                // --- IDENTIFICAÇÃO (Escrita Espelhada) ---
                company_id: linha['Company_id'],
                empresa_id: companyId,
                
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'],

                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],

                auditora: linha['Auditora'],
                nome_auditora_raw: linha['Auditora'],

                // --- DADOS DA AUDITORIA ---
                doc_name: linha['doc_name'],
                nome_documento: linha['doc_name'],

                status: linha['STATUS'],

                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],

                porcentagem: linha['% Assert'],

                // --- MÉTRICAS ---
                campos: nCampos,
                num_campos: nCampos,

                ok: nOk,
                qtd_ok: nOk,

                nok: nNok,
                qtd_nok: nNok
            };

            // Guarda no Map sobrescrevendo se a chave já existir (mantém o último/mais recente do CSV)
            mapaDuplicatas.set(chaveUnica, objeto);
        }

        // Converte Map de volta para Array
        const listaFinal = Array.from(mapaDuplicatas.values());

        console.log(`✅ ${listaFinal.length} registos únicos prontos para envio (Deduplicados de ${linhas.length}).`);

        if (listaFinal.length > 0) {
            await this.enviarParaSupabase(listaFinal);
        } else {
            alert("Nenhum dado válido encontrado.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 100;
            let totalInserido = 0;
            
            for (let i = 0; i < dados.length; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // --- MUDANÇA CRÍTICA: UPSERT ---
                // onConflict: colunas definidas no SQL
                // ignoreDuplicates: false (queremos ATUALIZAR se existir, ex: REV -> NOK)
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'assistente, data_auditoria, empresa, doc_name',
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                console.log(`📦 Lote processado: ${totalInserido} / ${dados.length}`);
            }

            alert(`Sucesso! ${totalInserido} auditorias processadas (Inseridas ou Atualizadas).`);
            
            if (window.Gestao && Gestao.Assertividade && typeof Gestao.Assertividade.carregar === 'function') {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Fatal no Supabase:", error);
            alert(`Erro ao salvar no banco: ${error.message || error.details}`);
        }
    }
};