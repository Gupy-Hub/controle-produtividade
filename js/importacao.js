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
        
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || input.nextElementSibling;
        let originalText = '';
        if(btn) { originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; btn.disabled = true; }

        let totalImportado = 0;
        let erros = 0;
        let nomesNaoEncontrados = new Set();

        try {
            // 1. Busca USUÁRIOS
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            // 2. Busca EMPRESAS (Para cruzar ID e Nome)
            const { data: empresasData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapas de Busca Rápida
            const mapaUsuariosID = {};
            const mapaUsuariosNome = {};
            (usersData || []).forEach(u => {
                if (u.id) mapaUsuariosID[String(u.id).trim()] = u.id;
                if (u.nome) mapaUsuariosNome[this.normalizar(u.nome)] = u.id;
            });

            const mapaEmpresas = {}; // Chave: nome ou subdominio normalizado -> Valor: Objeto Empresa
            (empresasData || []).forEach(e => {
                mapaEmpresas[this.normalizar(e.nome)] = e;
                if(e.subdominio) mapaEmpresas[this.normalizar(e.subdominio)] = e;
            });

            // 3. Processa Arquivos
            for (const file of files) {
                let dados = await this.lerArquivoUnificado(file);
                const payload = [];
                
                // Detecta se é arquivo de Auditoria
                const isAuditoria = dados.some(r => r['end_time'] || r['Auditora'] || r['% Assert']);

                for (let row of dados) {
                    // Normaliza chaves
                    const chaves = {};
                    Object.keys(row).forEach(k => {
                        chaves[this.normalizar(k).replace(/_/g, '')] = row[k]; 
                    });

                    // Identifica Usuário
                    let idCsv = chaves['idassistente'] || chaves['id'];
                    let nomeCsv = chaves['assistente'] || chaves['nome'] || chaves['colaborador'];
                    
                    if ((!idCsv && !nomeCsv) || (nomeCsv && this.normalizar(nomeCsv) === 'total')) continue;

                    let usuarioId = null;
                    if (idCsv && mapaUsuariosID[String(idCsv).trim()]) usuarioId = mapaUsuariosID[String(idCsv).trim()];
                    else if (nomeCsv && mapaUsuariosNome[this.normalizar(nomeCsv)]) usuarioId = mapaUsuariosNome[this.normalizar(nomeCsv)];

                    if (!usuarioId) {
                        nomesNaoEncontrados.add(nomeCsv || idCsv);
                        continue;
                    }

                    // --- AUDITORIA ---
                    if (isAuditoria) {
                        let dataRef = null;
                        let horaRef = null;
                        
                        // Extrai Data/Hora do end_time
                        const rawDate = row['end_time'] || row['Data']; // Ex: 2025-10-20T14:02...
                        if (rawDate) {
                            try {
                                const dObj = new Date(rawDate);
                                if (!isNaN(dObj)) {
                                    dataRef = dObj.toISOString().split('T')[0];
                                    horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                                }
                            } catch(e) {}
                        }
                        if (!dataRef) dataRef = this.extrairDataDoNome(file.name) || document.getElementById('global-date')?.value;
                        if (!dataRef) continue;

                        // Identifica Empresa (Nome e ID)
                        const empRaw = row['Empresa'] || '';
                        let empFinal = empRaw;
                        
                        // Tenta achar no cadastro de empresas
                        if (empRaw) {
                            const empEncontrada = mapaEmpresas[this.normalizar(empRaw)];
                            if (empEncontrada) {
                                // Formato solicitado: Nome Oficial (ID: 123)
                                empFinal = `${empEncontrada.nome} (ID: ${empEncontrada.id})`;
                            } else {
                                // Se não achar, mantém o que veio no CSV
                                empFinal = empRaw;
                            }
                        }

                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataRef,
                            quantidade: 1,
                            fator: 1,
                            
                            // Campos Mapeados
                            empresa: empFinal, // Agora contém o ID se encontrado
                            auditora: row['Auditora'] || '',
                            status: row['STATUS'] || row['Status'] || '',
                            observacao: row['Apontamentos/obs'] || row['Apontamentos'] || '',
                            nok: row['Nok'] || row['NOK'] || '',
                            assertividade: row['% Assert'] || row['Assertividade'] || '',
                            hora: horaRef,
                            
                            // Campos zerados
                            fifo: 0, gradual_total: 0, gradual_parcial: 0, perfil_fc: 0
                        });

                    } else {
                        // --- IMPORTAÇÃO ANTIGA ---
                        let dataRef = this.extrairDataDoNome(file.name) || document.getElementById('global-date')?.value;
                        if (!dataRef) continue;
                        const getNum = (v) => parseFloat(String(v || 0).replace(',', '.')) || 0;
                        
                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataRef,
                            quantidade: getNum(chaves['documentosvalidados'] || chaves['quantidade']),
                            fifo: getNum(chaves['fifo']),
                            fator: 1
                        });
                    }
                }

                if (payload.length > 0) {
                    const { error } = await Sistema.supabase.from('producao').insert(payload);
                    if (error) console.error("Erro ao inserir:", error);
                    else totalImportado += payload.length;
                }
            }

            let msg = `Processo Finalizado!\nRegistros Importados: ${totalImportado}`;
            if (nomesNaoEncontrados.size) msg += `\n\nALERTA: Usuários não cadastrados:\n${Array.from(nomesNaoEncontrados).slice(0,10).join('\n')}`;
            
            alert(msg);
            location.reload();

        } catch (e) {
            console.error(e);
            alert("Erro fatal: " + e.message);
        } finally {
            if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
            input.value = "";
        }
    }
};
window.Importacao = Produtividade.Importacao;
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);