// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    // Remove acentos e normaliza para minúsculas
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto)
            .trim()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); 
    },

    // Nova função inteligente para tratar datas (Excel número ou Texto CSV)
    tratarData: function(valor) {
        if (!valor) return null;

        // Caso 1: Data do Excel (Número serial, ex: 45321)
        if (typeof valor === 'number') {
            const dateObj = XLSX.SSF.parse_date_code(valor);
            return `${dateObj.y}-${String(dateObj.m).padStart(2,'0')}-${String(dateObj.d).padStart(2,'0')}`;
        }

        // Caso 2: Data Texto (CSV, ex: "25/12/2023" ou "2023-12-25")
        if (typeof valor === 'string') {
            const v = valor.trim();
            
            // Formato PT-BR: DD/MM/YYYY
            if (v.includes('/')) {
                const partes = v.split('/');
                if (partes.length === 3) {
                    // Assume dia/mes/ano
                    const dia = partes[0].padStart(2, '0');
                    const mes = partes[1].padStart(2, '0');
                    const ano = partes[2];
                    // Retorna YYYY-MM-DD
                    return `${ano}-${mes}-${dia}`; 
                }
            }
            
            // Formato ISO: YYYY-MM-DD
            if (v.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return v;
            }
        }
        
        return null; // Data inválida
    },

    processarArquivo: async function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // Lê o arquivo. 'codepage' ajuda com acentos em CSVs antigos se necessário
                    const workbook = XLSX.read(data, { type: 'array', codepage: 65001 }); 
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    // 'raw: false' força a leitura como texto exibido, ajuda em alguns CSVs
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // Compatibilidade
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
                
                // Começa do índice 1 para pular cabeçalho
                for (let i = 1; i < linhas.length; i++) {
                    const row = linhas[i];
                    if (!row || row.length === 0) continue;

                    const nomeExcel = row[0]; 
                    const dataBruta = row[1]; 
                    const qtd = row[2];       
                    
                    if (!nomeExcel || !dataBruta) continue;

                    // Normaliza nome para busca
                    const nomeBusca = this.normalizar(nomeExcel);
                    const usuarioId = mapaUsuarios[nomeBusca];

                    if (usuarioId) {
                        const dataFormatada = this.tratarData(dataBruta);
                        
                        if (dataFormatada) {
                            // Prepara colunas opcionais (trocando vírgula por ponto se vier do CSV PT-BR)
                            const limparNumero = (val) => {
                                if (typeof val === 'string') return Number(val.replace(',', '.')) || 0;
                                return Number(val) || 0;
                            };

                            payload.push({
                                usuario_id: usuarioId,
                                data_referencia: dataFormatada,
                                quantidade: limparNumero(qtd),
                                fifo: limparNumero(row[3]),
                                gradual_total: limparNumero(row[4]),
                                gradual_parcial: limparNumero(row[5]),
                                perfil_fc: limparNumero(row[6]),
                                fator: 1
                            });
                        } else {
                            console.warn(`Data inválida na linha ${i+1}: ${dataBruta}`);
                        }
                    } else {
                        nomesNaoEncontrados.add(nomeExcel);
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

            let msg = `Importação concluída!\nRegistros salvos: ${totalImportado}`;
            if (erros > 0) msg += `\nArquivos com erro de gravação: ${erros}`;
            if (nomesNaoEncontrados.size > 0) {
                msg += `\n\nAlguns nomes do arquivo não foram encontrados no sistema (ex: ${Array.from(nomesNaoEncontrados).slice(0,3).join(', ')}...).`;
            }
            alert(msg);
            
            // Recarrega tela
            if(window.Produtividade && window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            } else {
                location.reload();
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
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