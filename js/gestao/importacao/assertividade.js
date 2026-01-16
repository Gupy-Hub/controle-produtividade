// Garante que o namespace global existe
window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    // Método gatilho do HTML (onchange)
    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            // Feedback visual no botão
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Inicia processamento
            this.lerCSV(file).finally(() => {
                // Restaura estado inicial
                input.value = ''; 
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.classList.remove('cursor-not-allowed', 'opacity-75');
                }
            });
        }
    },

    // Leitura robusta com PapaParse
    lerCSV: function(file) {
        return new Promise((resolve) => {
            console.log("📂 [Importacao] Iniciando leitura via PapaParse...");
            
            Papa.parse(file, {
                header: true, // Usa cabeçalho do CSV
                skipEmptyLines: true,
                encoding: "UTF-8", // Importante para acentos (PT-BR)
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
        
        // Mapeamento baseado no DDL do Banco e Headers do CSV (Dezembro.csv)
        for (const linha of linhas) {
            
            // Validação mínima: Se não tem nome de assistente, pula (linha inválida ou totalizador)
            if (!linha['Assistente']) continue;

            // 1. Tratamento de Data (DD/MM/YYYY -> YYYY-MM-DD)
            // Nota: O CSV tem um espaço extra no header: "Data da Auditoria "
            const dataRaw = linha['Data da Auditoria '] || linha['Data da Auditoria'] || ''; 
            let dataFmt = null;
            
            if (dataRaw && dataRaw.includes('/')) {
                const [d, m, y] = dataRaw.trim().split('/');
                dataFmt = `${y}-${m}-${d}`;
            } else {
                // Fallback: data de hoje se falhar
                dataFmt = new Date().toISOString().split('T')[0];
            }

            // 2. Tratamento Numérico
            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            // 3. Montagem do Objeto (Escrita Espelhada para compatibilidade total)
            listaParaSalvar.push({
                // --- CHAVES E DATAS ---
                usuario_id: idAssistente,       // FK para usuarios
                data_auditoria: dataFmt,        // Coluna date
                data_referencia: dataFmt,       // Coluna timestamp (redundância útil)
                created_at: new Date().toISOString(),

                // --- IDENTIFICAÇÃO ---
                company_id: linha['Company_id'], // Texto/Original
                empresa_id: companyId,           // Bigint
                
                empresa: linha['Empresa'],       // Legado
                empresa_nome: linha['Empresa'],  // Novo padrão

                assistente: linha['Assistente'],      // Legado
                nome_assistente: linha['Assistente'], // Novo padrão (usado na View)

                auditora: linha['Auditora'],          // Legado
                nome_auditora_raw: linha['Auditora'], // Novo padrão

                // --- DADOS DA AUDITORIA ---
                doc_name: linha['doc_name'],       // Legado
                nome_documento: linha['doc_name'], // Novo padrão

                status: linha['STATUS'],

                obs: linha['Apontamentos/obs'],        // Legado
                observacao: linha['Apontamentos/obs'], // Novo padrão

                porcentagem: linha['% Assert'], // Mantém formato texto (ex: "100,00%") conforme DDL

                // --- MÉTRICAS ---
                campos: nCampos,      // Legado
                num_campos: nCampos,  // Novo padrão

                ok: nOk,              // Legado
                qtd_ok: nOk,          // Novo padrão

                nok: nNok,            // Legado
                qtd_nok: nNok         // Novo padrão
            });
        }

        console.log(`✅ ${listaParaSalvar.length} registos processados e prontos para envio.`);

        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado. Verifique se as colunas do CSV (ex: 'Assistente', 'Company_id') estão corretas.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            // Envio em Lotes (Batch) para evitar timeout
            const BATCH_SIZE = 100;
            let totalInserido = 0;
            
            for (let i = 0; i < dados.length; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // INSERT simples (Tabela assertividade não tem Unique Key clara no DDL)
                // Se houvesse, usaríamos .upsert()
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .insert(lote);

                if (error) throw error;
                
                totalInserido += lote.length;
                console.log(`📦 Lote enviado: ${totalInserido} / ${dados.length}`);
            }

            alert(`Sucesso! ${totalInserido} auditorias importadas.`);
            
            // Atualiza a grid se estiver na tela
            if (window.Gestao && Gestao.Assertividade && typeof Gestao.Assertividade.carregar === 'function') {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Fatal no Supabase:", error);
            alert(`Erro ao salvar no banco: ${error.message || error.details}`);
        }
    }
};