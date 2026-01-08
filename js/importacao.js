window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    // Normaliza texto para o Fallback de nomes
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    },

    // Extrai data do nome do arquivo (DDMMAAAA)
    extrairDataDoNome: function(nomeArquivo) {
        const match = nomeArquivo.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    lerArquivoUnificado: async function(file) {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();

            // CSV (PapaParse)
            if (ext === 'csv') {
                Papa.parse(file, {
                    header: true, // Importante: Usa o cabeçalho para achar 'id_assistente'
                    skipEmptyLines: true,
                    encoding: "UTF-8",
                    complete: function(results) {
                        resolve(results.data);
                    },
                    error: function(err) {
                        reject(err);
                    }
                });
            } 
            // Excel (SheetJS)
            else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet); 
                        resolve(jsonData);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        });
    },

    importarEmMassa: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || 
                    (input.nextElementSibling && input.nextElementSibling.tagName === 'BUTTON' ? input.nextElementSibling : null);
        
        let originalText = '';
        if(btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando IDs...';
            btn.disabled = true;
        }

        let totalImportado = 0;
        let erros = 0;
        let nomesNaoEncontrados = new Set();

        try {
            // 1. Busca usuários do banco (ID e Nome)
            const { data: usersData, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');

            if (userError) throw new Error("Erro ao buscar usuários: " + userError.message);

            // Cria dois mapas para busca rápida
            const mapaPorID = {};
            const mapaPorNome = {};

            usersData.forEach(u => {
                // Mapa de IDs (Converte tudo para string para evitar erro de tipo numero vs texto)
                if (u.id) mapaPorID[String(u.id).trim()] = u.id;
                
                // Mapa de Nomes (Fallback)
                if (u.nome) mapaPorNome[this.normalizar(u.nome)] = u.id;
            });

            // 2. Processa arquivos
            for (const file of files) {
                let dataReferencia = this.extrairDataDoNome(file.name);
                
                // Fallback de data
                if (!dataReferencia) {
                    const dataGlobal = document.getElementById('global-date').value;
                    if (dataGlobal) dataReferencia = dataGlobal;
                    else continue; 
                }

                const dados = await this.lerArquivoUnificado(file);
                const payload = [];

                for (let row of dados) {
                    // Normaliza chaves do objeto para minúsculas e sem espaços
                    // Ex: "ID Assistente" vira "idassistente"
                    const chaves = Object.keys(row).reduce((acc, k) => {
                        const keyClean = this.normalizar(k).replace(/_/g, ''); // remove underscores também
                        acc[keyClean] = row[k];
                        return acc;
                    }, {});

                    // Tenta encontrar o ID na linha do CSV
                    const idCsv = chaves['idassistente'] || chaves['id'] || chaves['matricula'];
                    const nomeCsv = chaves['assistente'] || chaves['nome'] || chaves['colaborador'];
                    
                    // Ignora linha de Totais
                    if ((nomeCsv && this.normalizar(nomeCsv) === 'total') || (!idCsv && !nomeCsv)) continue;

                    let usuarioIdEncontrado = null;

                    // ESTRATÉGIA 1: BUSCA POR ID (PRIORIDADE)
                    if (idCsv && mapaPorID[String(idCsv).trim()]) {
                        usuarioIdEncontrado = mapaPorID[String(idCsv).trim()];
                    }
                    // ESTRATÉGIA 2: BUSCA POR NOME (FALLBACK)
                    else if (nomeCsv && mapaPorNome[this.normalizar(nomeCsv)]) {
                        usuarioIdEncontrado = mapaPorNome[this.normalizar(nomeCsv)];
                    }

                    if (usuarioIdEncontrado) {
                        const getNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (!val) return 0;
                            let v = String(val).replace(/\./g, '').replace(',', '.');
                            return parseFloat(v) || 0;
                        };

                        // Mapeamento das colunas de produção
                        // Tenta variações de nomes para garantir o match
                        const qtd = getNum(chaves['documentosvalidados'] || chaves['quantidade'] || chaves['total']);
                        const fifo = getNum(chaves['documentosvalidadosfifo'] || chaves['fifo']);
                        const gTotal = getNum(chaves['documentosvalidadosgradualtotal'] || chaves['gradualtotal']);
                        const gParcial = getNum(chaves['documentosvalidadosgradualparcial'] || chaves['gradualparcial']);
                        const perfilFc = getNum(chaves['documentosvalidadosperfilfc'] || chaves['perfilfc']);

                        payload.push({
                            usuario_id: usuarioIdEncontrado,
                            data_referencia: dataReferencia,
                            quantidade: qtd,
                            fifo: fifo,
                            gradual_total: gTotal,
                            gradual_parcial: gParcial,
                            perfil_fc: perfilFc,
                            fator: 1
                        });
                    } else {
                        // Se não achou nem por ID nem por Nome, registra erro
                        const identificador = nomeCsv ? `${nomeCsv} (ID: ${idCsv})` : `ID: ${idCsv}`;
                        nomesNaoEncontrados.add(identificador);
                    }
                }

                if (payload.length > 0) {
                    const { error } = await Sistema.supabase
                        .from('producao')
                        .upsert(payload, { onConflict: 'usuario_id, data_referencia' });

                    if (error) {
                        console.error(`Erro ao salvar dados:`, error);
                        erros++;
                    } else {
                        totalImportado += payload.length;
                    }
                }
            }

            let msg = `Processamento Finalizado!\n\nRegistros Salvos: ${totalImportado}`;
            
            if (nomesNaoEncontrados.size > 0) {
                const lista = Array.from(nomesNaoEncontrados).slice(0, 10).join('\n');
                msg += `\n\nALERTA: Usuários não encontrados no cadastro:\n${lista}${nomesNaoEncontrados.size > 10 ? '\n... e outros' : ''}`;
            }

            alert(msg);

            // Atualiza tela
            if(window.Produtividade && window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            } else {
                location.reload();
            }

        } catch (e) {
            console.error(e);
            alert("Erro fatal: " + e.message);
        } finally {
            if(btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            input.value = "";
        }
    }
};

window.Importacao = Produtividade.Importacao;
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);