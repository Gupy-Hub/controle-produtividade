window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    },

    extrairDataDoNome: function(nomeArquivo) {
        const match = nomeArquivo.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) return `${match[3]}-${match[2]}-${match[1]}`;
        return null;
    },

    lerArquivoUnificado: async function(file) {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'csv') {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: "UTF-8",
                    complete: (results) => resolve(results.data),
                    error: (err) => reject(err)
                });
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        resolve(XLSX.utils.sheet_to_json(firstSheet));
                    } catch (err) { reject(err); }
                };
                reader.readAsArrayBuffer(file);
            }
        });
    },

    importarEmMassa: async function(input) {
        if (!input.files || input.files.length === 0) return;
        const files = Array.from(input.files);
        
        // Feedback visual no botão
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || input.nextElementSibling;
        let originalText = '';
        if(btn) { originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; btn.disabled = true; }

        let totalImportado = 0;
        let erros = 0;
        let nomesNaoEncontrados = new Set();

        try {
            // 1. Busca usuários
            const { data: usersData, error: userError } = await Sistema.supabase.from('usuarios').select('id, nome');
            if (userError) throw new Error("Erro ao buscar usuários: " + userError.message);

            const mapaPorID = {};
            const mapaPorNome = {};
            usersData.forEach(u => {
                if (u.id) mapaPorID[String(u.id).trim()] = u.id;
                if (u.nome) mapaPorNome[this.normalizar(u.nome)] = u.id;
            });

            // 2. Processa arquivos
            for (const file of files) {
                let dados = await this.lerArquivoUnificado(file);
                const payload = [];
                
                // Detecta se é o arquivo de Auditoria (tem coluna 'Auditora' ou 'end_time')
                // Verifica na primeira linha válida
                const isAuditoria = dados.some(r => r['Auditora'] || r['end_time'] || r['% Assert']);

                for (let row of dados) {
                    const chaves = {};
                    // Normaliza chaves
                    Object.keys(row).forEach(k => {
                        chaves[this.normalizar(k).replace(/_/g, '')] = row[k]; 
                    });

                    // Identifica Usuário
                    let idCsv = chaves['idassistente'] || chaves['id'] || chaves['matricula'];
                    let nomeCsv = chaves['assistente'] || chaves['nome'] || chaves['colaborador'];
                    
                    // Pula linhas de total ou vazias
                    if (!idCsv && !nomeCsv) continue;
                    if (nomeCsv && this.normalizar(nomeCsv) === 'total') continue;

                    let usuarioId = null;
                    if (idCsv && mapaPorID[String(idCsv).trim()]) usuarioId = mapaPorID[String(idCsv).trim()];
                    else if (nomeCsv && mapaPorNome[this.normalizar(nomeCsv)]) usuarioId = mapaPorNome[this.normalizar(nomeCsv)];

                    if (!usuarioId) {
                        nomesNaoEncontrados.add(nomeCsv || idCsv);
                        continue;
                    }

                    // --- LÓGICA DO ARQUIVO DE AUDITORIA ---
                    if (isAuditoria) {
                        // Data e Hora do end_time (Ex: 2025-10-20T14:02:18.175Z)
                        let dataRef = null;
                        let horaRef = null;
                        
                        // Tenta pegar do endtime ou enturma
                        const rawDate = row['end_time'] || row['Data'] || row['Date'];
                        if (rawDate) {
                            try {
                                const dObj = new Date(rawDate);
                                if (!isNaN(dObj)) {
                                    dataRef = dObj.toISOString().split('T')[0];
                                    horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                                }
                            } catch(e) {}
                        }

                        // Se não conseguiu extrair data do registro, tenta do nome do arquivo ou input global
                        if (!dataRef) {
                            dataRef = this.extrairDataDoNome(file.name);
                            if (!dataRef) dataRef = document.getElementById('global-date')?.value;
                        }

                        if (!dataRef) continue; // Sem data não importa

                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataRef,
                            quantidade: 1, // Cada linha é 1 documento
                            fator: 1,
                            
                            // Campos Novos Solicitados
                            empresa: row['Empresa'] || '',
                            auditora: row['Auditora'] || '',
                            status: row['STATUS'] || row['Status'] || '',
                            observacao: row['Apontamentos/obs'] || row['Apontamentos'] || '',
                            nok: row['Nok'] || row['NOK'] || '',
                            assertividade: row['% Assert'] || row['Assertividade'] || '',
                            hora: horaRef,
                            
                            // Campos antigos zerados para não bugar
                            fifo: 0, gradual_total: 0, gradual_parcial: 0, perfil_fc: 0
                        });

                    } else {
                        // --- LÓGICA ANTIGA (Contagem Agrupada) ---
                        let dataRef = this.extrairDataDoNome(file.name) || document.getElementById('global-date')?.value;
                        if (!dataRef) continue;

                        const getNum = (v) => parseFloat(String(v || 0).replace(',', '.')) || 0;
                        
                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataRef,
                            quantidade: getNum(chaves['documentosvalidados'] || chaves['quantidade'] || chaves['total']),
                            fifo: getNum(chaves['documentosvalidadosfifo'] || chaves['fifo']),
                            gradual_total: getNum(chaves['documentosvalidadosgradualtotal'] || chaves['gradualtotal']),
                            gradual_parcial: getNum(chaves['documentosvalidadosgradualparcial'] || chaves['gradualparcial']),
                            perfil_fc: getNum(chaves['documentosvalidadosperfilfc'] || chaves['perfilfc']),
                            fator: 1
                        });
                    }
                }

                if (payload.length > 0) {
                    // ATENÇÃO: Se for Auditoria (várias linhas por dia), não podemos usar onConflict que trava data+usuario
                    // O ideal é a tabela ter ID único autoincrement.
                    // Aqui usamos upsert básico. Se sua tabela tiver restrição unique(usuario_id, data_referencia), isso dará erro ao tentar inserir a 2ª linha do mesmo dia.
                    
                    const { error } = await Sistema.supabase.from('producao').upsert(payload);
                    // Se der erro de duplicidade, você deve remover a constraint "unique" do banco no Supabase

                    if (error) { console.error(error); erros++; }
                    else { totalImportado += payload.length; }
                }
            }

            let msg = `Finalizado!\nRegistros: ${totalImportado}`;
            if (nomesNaoEncontrados.size) msg += `\nNão encontrados:\n${Array.from(nomesNaoEncontrados).slice(0,10).join('\n')}`;
            alert(msg);
            location.reload();

        } catch (e) {
            console.error(e);
            alert("Erro: " + e.message);
        } finally {
            if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
            input.value = "";
        }
    }
};
window.Importacao = Produtividade.Importacao;
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);