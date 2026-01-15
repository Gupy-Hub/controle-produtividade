Gestao.ImportacaoAssertividade = {
    // Cache de elementos do DOM
    elements: {
        fileInput: 'arquivo-assertividade',
        btnImportar: 'btn-importar-assertividade',
        progressBar: 'progress-assertividade',
        logArea: 'log-importacao-assertividade'
    },

    init: function() {
        const btn = document.getElementById(this.elements.btnImportar);
        if (btn) {
            // Remove listeners antigos para evitar duplicação (boas práticas de SPA)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => this.iniciarImportacao());
        }
    },

    log: function(msg, type = 'info') {
        const logArea = document.getElementById(this.elements.logArea);
        if (logArea) {
            const color = type === 'error' ? 'text-red-500' : (type === 'success' ? 'text-emerald-500' : 'text-slate-500');
            const icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
            logArea.innerHTML += `<div class="text-xs ${color} mb-1 font-mono border-b border-slate-50 pb-1">${icon} ${msg}</div>`;
            logArea.scrollTop = logArea.scrollHeight;
        }
        console.log(`[Importação] ${msg}`);
    },

    iniciarImportacao: async function() {
        const fileInput = document.getElementById(this.elements.fileInput);
        if (!fileInput || !fileInput.files.length) {
            alert("Selecione um arquivo CSV primeiro.");
            return;
        }

        const file = fileInput.files[0];
        this.log(`Arquivo selecionado: ${file.name}`, 'info');
        
        // Limpa log anterior
        const logArea = document.getElementById(this.elements.logArea);
        if(logArea) logArea.innerHTML = '';

        // UI Feedback
        const btn = document.getElementById(this.elements.btnImportar);
        if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; }

        try {
            await this.processarCSV(file);
        } catch (error) {
            this.log(`Erro fatal: ${error.message}`, 'error');
            alert("Erro na importação. Veja o log.");
        } finally {
            if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-import"></i> Iniciar Importação'; }
        }
    },

    processarCSV: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const text = e.target.result;
                    const rows = text.split('\n');
                    
                    if (rows.length < 2) throw new Error("Arquivo vazio ou sem cabeçalho.");

                    const listaParaSalvar = [];
                    let ignorados = 0;

                    // Regex para separar CSV respeitando aspas (ex: "Silva, Maria")
                    const regexSplit = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

                    this.log(`Total de linhas encontradas: ${rows.length}`, 'info');

                    // Itera ignorando o cabeçalho (i=1)
                    for (let i = 1; i < rows.length; i++) {
                        const rowRaw = rows[i].trim();
                        if (!rowRaw) continue;

                        const cols = rowRaw.split(regexSplit).map(c => c.replace(/^"|"$/g, '').trim()); // Remove aspas extras
                        
                        // Mapeamento baseado no seu CSV (Dezembro.csv)
                        // Ajuste os índices se o layout mudar
                        // 2: company_id, 3: empresa, 5: assistente, 6: doc_name, 7: status, 9: obs, 10: campos, 11: ok, 12: nok
                        // 13: % Assert (CRÍTICO), 14: Data Auditoria (CRÍTICO), 15: Auditora
                        
                        if (cols.length < 13) {
                            ignorados++;
                            continue;
                        }

                        const pctRaw = cols[13]; // Coluna % Assert
                        
                        // --- LÓGICA BLINDADA DE VALIDAÇÃO ---
                        // Ignora o Status, foca apenas se existe uma nota válida
                        
                        let shouldImport = false;
                        let porcentagemValidada = null;

                        if (pctRaw && pctRaw !== '' && pctRaw !== '-') {
                            // Limpa string (ex: "100,00%" -> 100.00)
                            const valStr = pctRaw.replace('%', '').replace(',', '.').trim();
                            const val = parseFloat(valStr);

                            // Regra de Ouro: É número entre 0 e 100?
                            if (!isNaN(val) && val >= 0 && val <= 100) {
                                shouldImport = true;
                                porcentagemValidada = pctRaw; // Mantém o original para o banco ou valStr se preferir numérico
                            }
                        }

                        if (shouldImport) {
                            // Tratamento de Data (DD/MM/YYYY -> YYYY-MM-DD)
                            const dataRaw = cols[14];
                            let dataFmt = null;
                            
                            if (dataRaw && dataRaw.includes('/')) {
                                const [dia, mes, ano] = dataRaw.split('/');
                                if (dia && mes && ano) dataFmt = `${ano}-${mes}-${dia}`;
                            } 
                            // Fallback: Tenta pegar do end_time (col 0) se data_auditoria estiver vazia
                            if (!dataFmt && cols[0]) {
                                try { dataFmt = cols[0].split('T')[0]; } catch(e){}
                            }

                            if (dataFmt) {
                                listaParaSalvar.push({
                                    company_id: cols[2] || null,
                                    empresa: cols[3] || '',
                                    assistente: cols[5] || 'Desconhecido',
                                    doc_name: cols[6] || '',
                                    status: cols[7] || 'IMPORTADO', // Salva o status original apenas para registro
                                    obs: cols[9] || '',
                                    campos: parseInt(cols[10]) || 0,
                                    ok: parseInt(cols[11]) || 0,
                                    nok: parseInt(cols[12]) || 0,
                                    porcentagem: porcentagemValidada,
                                    data_auditoria: dataFmt,
                                    auditora: cols[15] || 'Sistema'
                                });
                            } else {
                                ignorados++; // Sem data válida
                            }
                        } else {
                            ignorados++; // Sem porcentagem válida
                        }
                    }

                    this.log(`Processamento concluído.`, 'info');
                    this.log(`Linhas Válidas (0-100%): ${listaParaSalvar.length}`, 'success');
                    this.log(`Linhas Ignoradas (Vazios/Erros): ${ignorados}`, 'info');

                    if (listaParaSalvar.length > 0) {
                        await this.enviarLote(listaParaSalvar);
                        resolve();
                    } else {
                        alert("Nenhuma linha válida encontrada. Verifique se a coluna '% Assert' (índice 13) contém números.");
                        resolve();
                    }

                } catch (err) {
                    reject(err);
                }
            };
            
            reader.readAsText(file);
        });
    },

    enviarLote: async function(lista) {
        const BATCH_SIZE = 100; // Tamanho do lote para não travar o banco
        const total = lista.length;
        let enviados = 0;

        // Limpa dados anteriores desse período? 
        // Opcional: Aqui estamos apenas inserindo (append), idealmente teria um delete antes se for reprocessamento.
        // Por segurança, vamos apenas inserir. O usuário deve limpar antes se quiser.

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = lista.slice(i, i + BATCH_SIZE);
            
            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(chunk);

            if (error) {
                this.log(`Erro no lote ${i}: ${error.message}`, 'error');
            } else {
                enviados += chunk.length;
                const pct = Math.round((enviados / total) * 100);
                const pb = document.getElementById(this.elements.progressBar);
                if(pb) pb.style.width = `${pct}%`;
                this.log(`Enviado: ${enviados}/${total}`, 'info');
            }
        }

        this.log("Importação Finalizada!", 'success');
        alert("Importação concluída com sucesso!");
        
        // Dispara evento para atualizar telas se necessário
        if (Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
    }
};