window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const fileName = file.name; // Ex: 01122025.csv

            // --- VALIDAÇÃO DO NOME DO ARQUIVO (REGRA DE OURO) ---
            // Extrai apenas os números do nome do arquivo
            const apenasNumeros = fileName.replace(/\D/g, ''); 
            
            // Esperamos pelo menos 8 dígitos (DDMMAAAA) no início ou fim
            // Lógica: Tenta pegar os primeiros 8 dígitos
            let dataReferenciaExtraida = null;
            
            if (apenasNumeros.length >= 8) {
                const dia = apenasNumeros.substring(0, 2);
                const mes = apenasNumeros.substring(2, 4);
                const ano = apenasNumeros.substring(4, 8);
                
                // Formato ISO para o banco (YYYY-MM-DD)
                dataReferenciaExtraida = `${ano}-${mes}-${dia}`;
                console.log(`📅 Data extraída do arquivo: ${dataReferenciaExtraida}`);
            } else {
                alert("ERRO: O nome do arquivo deve conter a data no formato DDMMAAAA (ex: 01122025.csv).");
                input.value = ''; // Limpa o input
                return;
            }

            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Passamos o arquivo e a data extraída para a leitura
            setTimeout(() => {
                this.lerCSV(file, dataReferenciaExtraida).finally(() => {
                    input.value = ''; 
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        btn.classList.remove('cursor-not-allowed', 'opacity-75');
                    }
                });
            }, 100);
        }
    },

    lerCSV: function(file, dataReferenciaArquivo) {
        return new Promise((resolve) => {
            console.time("TempoLeitura");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas no arquivo: ${results.data.length}`);
                    // Passamos os dados e a data de referência fixa
                    await this.tratarEEnviar(results.data, dataReferenciaArquivo);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro crítico ao ler o arquivo CSV.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas, dataRef) {
        console.time("TempoTratamento");
        const listaParaSalvar = [];
        const agora = new Date().toISOString();

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Ignora linhas sem assistente (rodapés ou lixo)
            if (!linha['Assistente']) continue;

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            
            // Tratamento numérico seguro
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                // IDs e Chaves
                usuario_id: idAssistente,
                company_id: linha['Company_id'], 
                empresa_id: companyId,
                
                // Datas (CRÍTICO: Usa a data do nome do arquivo)
                data_referencia: dataRef, 
                data_auditoria: dataRef, // Assumindo que a data do arquivo é a data da auditoria
                created_at: agora,

                // Dados Descritivos
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'], // Redundância para garantir compatibilidade
                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],
                auditora: linha['Auditora'],
                // doc_name é chave fundamental para o UPSERT
                doc_name: linha['doc_name'] || 'Documento Desconhecido', 
                nome_documento: linha['doc_name'],
                
                // Métricas e Status
                status: linha['STATUS'], 
                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],
                porcentagem: linha['% Assert'], 
                
                // Contadores
                campos: nCampos,
                num_campos: nCampos,
                ok: nOk,
                qtd_ok: nOk,
                nok: nNok,
                qtd_nok: nNok
            };

            listaParaSalvar.push(objeto);
        }

        console.timeEnd("TempoTratamento");
        
        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            
            const statusDiv = document.getElementById('status-importacao');
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // O onConflict DEVE bater com o índice criado no SQL:
                // assistente, data_referencia, doc_name, status
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'assistente,data_referencia,doc_name,status',
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                // Feedback visual a cada 5k ou no final
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Importando: ${pct}%`);
                    if(statusDiv) statusDiv.innerText = `${pct}%`;
                }
            }

            alert(`Sucesso! ${totalInserido} registros importados/atualizados.`);
            
            // Recarrega a tela de gestão se existir
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            // Mensagem amigável para erro de constraint
            if (error.code === '42P10') {
                alert("Erro de configuração no Banco de Dados (Índice Único ausente). Contate o TI.");
            } else {
                alert(`Erro na importação: ${error.message}`);
            }
        }
    }
};