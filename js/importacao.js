window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    // Remove acentos e espaços para comparação de nomes
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    },

    // Extrai a data do NOME DO ARQUIVO (ex: "02012026.csv" -> "2026-01-02")
    extrairDataDoNome: function(nomeArquivo) {
        // Procura por 8 digitos seguidos (DDMMAAAA)
        const match = nomeArquivo.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    // Função genérica para ler CSV ou Excel e devolver JSON limpo
    lerArquivoUnificado: async function(file) {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();

            // Lógica para CSV (PapaParse - Mais robusto)
            if (ext === 'csv') {
                Papa.parse(file, {
                    header: true, // Usa a primeira linha como chave
                    skipEmptyLines: true,
                    encoding: "UTF-8", // Tenta UTF-8
                    complete: function(results) {
                        resolve(results.data);
                    },
                    error: function(err) {
                        reject(err);
                    }
                });
            } 
            // Lógica para Excel (SheetJS)
            else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        // Gera JSON usando a primeira linha como cabeçalho
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
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            btn.disabled = true;
        }

        let totalImportado = 0;
        let erros = 0;
        let arquivosSemData = [];
        let nomesNaoEncontrados = new Set();

        try {
            // 1. Carrega usuários do banco
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
                // Tenta extrair data do nome do arquivo
                let dataReferencia = this.extrairDataDoNome(file.name);
                
                // Se não achou data no nome, usa a data do seletor global como fallback
                if (!dataReferencia) {
                    const dataGlobal = document.getElementById('global-date').value;
                    if (dataGlobal) {
                        dataReferencia = dataGlobal;
                    } else {
                        arquivosSemData.push(file.name);
                        continue; // Pula este arquivo
                    }
                }

                const dados = await this.lerArquivoUnificado(file);
                const payload = [];

                for (let row of dados) {
                    // Normaliza as chaves do objeto para minúsculas (evita erros de Assistente vs assistente)
                    const chaves = Object.keys(row).reduce((acc, k) => {
                        acc[this.normalizar(k)] = row[k];
                        return acc;
                    }, {});

                    // Pega o nome. Tenta colunas comuns
                    const nome = chaves['assistente'] || chaves['nome'] || chaves['colaborador'];
                    
                    // Ignora linha de Totais ou linhas vazias
                    if (!nome || this.normalizar(nome) === 'total') continue;

                    const usuarioId = mapaUsuarios[this.normalizar(nome)];

                    if (usuarioId) {
                        // Função helper para limpar numeros
                        const getNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (!val) return 0;
                            // Remove pontos de milhar e troca virgula decimal por ponto
                            // Ex: "1.499" -> 1499 | "1,5" -> 1.5
                            let v = String(val).replace(/\./g, '').replace(',', '.');
                            return parseFloat(v) || 0;
                        };

                        // Mapeamento baseado no seu CSV
                        const quantidade = getNum(chaves['documentosvalidados'] || chaves['quantidade'] || chaves['total']);
                        const fifo = getNum(chaves['documentosvalidadosfifo'] || chaves['fifo']);
                        const gTotal = getNum(chaves['documentosvalidadosgradualtotal'] || chaves['gradualtotal']);
                        const gParcial = getNum(chaves['documentosvalidadosgradualparcial'] || chaves['gradualparcial']);
                        const perfilFc = getNum(chaves['documentosvalidadosperfilfc'] || chaves['perfilfc']);

                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataReferencia,
                            quantidade: quantidade,
                            fifo: fifo,
                            gradual_total: gTotal,
                            gradual_parcial: gParcial,
                            perfil_fc: perfilFc,
                            fator: 1
                        });
                    } else {
                        nomesNaoEncontrados.add(nome);
                    }
                }

                if (payload.length > 0) {
                    const { error } = await Sistema.supabase
                        .from('producao')
                        .upsert(payload, { onConflict: 'usuario_id, data_referencia' });

                    if (error) {
                        console.error(`Erro ao salvar dados de ${file.name}:`, error);
                        erros++;
                    } else {
                        totalImportado += payload.length;
                    }
                }
            }

            // Relatório Final
            let msg = `Processamento Finalizado!\n\nRegistros Importados: ${totalImportado}`;
            
            if (arquivosSemData.length > 0) {
                msg += `\n\nALERTA: Arquivos ignorados (sem data no nome):\n${arquivosSemData.join('\n')}`;
            }
            
            if (nomesNaoEncontrados.size > 0) {
                const lista = Array.from(nomesNaoEncontrados).slice(0, 5).join(', ');
                msg += `\n\nALERTA: Nomes não encontrados no cadastro:\n${lista}${nomesNaoEncontrados.size > 5 ? '...' : ''}`;
            }

            alert(msg);

            // Atualiza a tela
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