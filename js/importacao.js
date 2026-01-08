// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    // Remove acentos, espaços extras e normaliza para minúsculas
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto)
            .trim()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); 
    },

    // Trata datas vindas do Excel (número) ou CSV (texto)
    tratarData: function(valor) {
        if (!valor) return null;

        // 1. Data Excel (Número serial)
        if (typeof valor === 'number') {
            const dateObj = XLSX.SSF.parse_date_code(valor);
            // Verifica se a conversão resultou em algo válido
            if (!dateObj || !dateObj.y) return null;
            return `${dateObj.y}-${String(dateObj.m).padStart(2,'0')}-${String(dateObj.d).padStart(2,'0')}`;
        }

        // 2. Data Texto (CSV)
        if (typeof valor === 'string') {
            let v = valor.trim();
            
            // Remove aspas se houver
            v = v.replace(/^"|"$/g, '');

            // Formato PT-BR: DD/MM/YYYY
            if (v.includes('/')) {
                const partes = v.split('/');
                if (partes.length === 3) {
                    const dia = partes[0].padStart(2, '0');
                    const mes = partes[1].padStart(2, '0');
                    // Corrige ano de 2 dígitos (ex: 23 -> 2023)
                    let ano = partes[2];
                    if (ano.length === 2) ano = "20" + ano;
                    
                    return `${ano}-${mes}-${dia}`; 
                }
            }
            
            // Formato ISO: YYYY-MM-DD
            if (v.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return v;
            }
        }
        
        return null;
    },

    processarArquivo: async function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // Lê o arquivo sem forçar codepage para deixar a lib detectar
                    const workbook = XLSX.read(data, { type: 'array' }); 
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    // Lê com header: 1 para pegar array de arrays
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // Compatibilidade com main.js antigo
    lerArquivo: function(file) {
        return this.processarArquivo(file);
    },

    importarEmMassa: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || 
                    (input.nextElementSibling && input.nextElementSibling.tagName === 'BUTTON' ? input.nextElementSibling : null);
        
        let originalText = '';
        if(btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            btn.disabled = true;
        }

        let totalImportado = 0;
        let erros = 0;
        let nomesNaoEncontrados = new Set();

        try {
            // 1. Busca usuários
            const { data: usersData, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');

            if (userError) throw new Error("Erro ao buscar usuários: " + userError.message);

            const mapaUsuarios = {};
            usersData.forEach(u => {
                if (u.nome) mapaUsuarios[this.normalizar(u.nome)] = u.id;
            });

            // 2. Processa cada arquivo
            for (const file of files) {
                const linhas = await this.processarArquivo(file);
                const payload = [];
                
                // Pula cabeçalho (começa do 1)
                for (let i = 1; i < linhas.length; i++) {
                    let row = linhas[i];
                    if (!row || row.length === 0) continue;

                    // --- CORREÇÃO PARA CSV BRASILEIRO (Ponto e Vírgula) ---
                    // Se a linha tem só 1 coluna e contém ';', separamos manualmente
                    if (row.length === 1 && typeof row[0] === 'string' && row[0].includes(';')) {
                        row = row[0].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                    }

                    const nomeExcel = row[0]; 
                    const dataBruta = row[1]; 
                    const qtd = row[2];       
                    
                    if (!nomeExcel || !dataBruta) continue;

                    // Busca ID
                    const nomeBusca = this.normalizar(nomeExcel);
                    const usuarioId = mapaUsuarios[nomeBusca];

                    if (usuarioId) {
                        const dataFormatada = this.tratarData(dataBruta);
                        
                        if (dataFormatada) {
                            // Limpeza de números (virgula para ponto, remove espaços)
                            const limparNumero = (val) => {
                                if (val === undefined || val === null || val === '') return 0;
                                if (typeof val === 'number') return val;
                                // Troca vírgula por ponto e remove qualquer char não numérico exceto . -
                                let v = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
                                return parseFloat(v) || 0;
                            };

                            payload.push({
                                usuario_id: usuarioId,
                                data_referencia: dataFormatada,
                                quantidade: limparNumero(qtd),
                                fifo: limparNumero(row[3]),
                                gradual_total: limparNumero(row[4]),
                                gradual_parcial: limparNumero(row[5]),
                                perfil_fc: limparNumero(row[6]),
                                fator: 1 // Padrão 100%
                            });
                        } else {
                            console.warn(`Data inválida na linha ${i+1}:`, dataBruta);
                        }
                    } else {
                        // Guarda o nome original para mostrar no alerta
                        if(nomeExcel.trim().length > 0) nomesNaoEncontrados.add(nomeExcel);
                    }
                }

                if (payload.length > 0) {
                    const { error } = await Sistema.supabase
                        .from('producao')
                        .upsert(payload, { onConflict: 'usuario_id, data_referencia' });

                    if (error) {
                        console.error("Erro SQL:", error);
                        erros++;
                    } else {
                        totalImportado += payload.length;
                    }
                }
            }

            // Mensagem Final
            let msg = `Importação concluída!\nRegistros processados e salvos: ${totalImportado}`;
            
            if (erros > 0) {
                msg += `\n\nATENÇÃO: ${erros} pacotes de dados falharam ao salvar no banco.`;
            }
            
            if (nomesNaoEncontrados.size > 0) {
                const listaNomes = Array.from(nomesNaoEncontrados).slice(0, 5).join(', ');
                const restante = nomesNaoEncontrados.size > 5 ? `... e mais ${nomesNaoEncontrados.size - 5}` : '';
                msg += `\n\nALERTA: ${nomesNaoEncontrados.size} nomes do arquivo NÃO foram encontrados no sistema:\n(${listaNomes}${restante})\n\nVerifique se os nomes no Excel são idênticos ao cadastro.`;
            }
            
            alert(msg);
            
            // Recarrega
            if(window.Produtividade && window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            } else {
                location.reload();
            }

        } catch (e) {
            console.error(e);
            alert("Erro fatal na importação: " + e.message);
        } finally {
            if(btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            input.value = ""; 
        }
    }
};

// Expondo globalmente
window.Importacao = Produtividade.Importacao;
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);