const Importacao = {
    // Normaliza texto para comparação (remove acentos e espaços)
    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto.toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .trim().replace(/\s+/g, " ");
    },

    // Limpa números (ex: "1.200,50" -> 1200.50)
    limparNumero: function(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        // Remove pontos de milhar e troca vírgula decimal por ponto
        const clean = val.toString().replace(/\./g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    },

    lerArquivo: function(inputElement) {
        return new Promise((resolve, reject) => {
            const file = inputElement.files[0];
            if (!file) return reject("Nenhum arquivo selecionado.");

            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    let workbook;

                    // Tenta ler como Excel, se falhar, tenta como CSV texto
                    try {
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (erroExcel) {
                        console.warn("Tentando ler como CSV texto...");
                        try {
                            const decoder = new TextDecoder('utf-8');
                            const text = decoder.decode(data);
                            workbook = XLSX.read(text, { type: 'string', raw: true });
                        } catch (erroCSV) {
                            const decoder = new TextDecoder('iso-8859-1');
                            const text = decoder.decode(data);
                            workbook = XLSX.read(text, { type: 'string', raw: true });
                        }
                    }
                    
                    // Tenta achar data no nome do arquivo
                    let dataDetectada = null;
                    const regexData = /(\d{2})(\d{2})(\d{4})/;
                    const match = file.name.match(regexData);
                    if (match) {
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`;
                    }

                    const firstSheet = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    console.error(err);
                    reject("Erro ao ler o arquivo. Verifique se o formato está correto.");
                }
            };
            
            reader.onerror = () => reject("Erro de leitura do arquivo.");
            reader.readAsArrayBuffer(file);
        });
    },

    processar: async function(dadosBrutos, dataReferencia) {
        if (!dataReferencia) throw new Error("Data de referência é obrigatória.");

        console.log("--- INICIANDO IMPORTAÇÃO V3 (ID + FUZZY MATCH) ---");

        // 1. Carregar usuários do Supabase
        const { data: usersDB, error } = await _supabase
            .from('usuarios')
            .select('id, nome, ativo')
            .eq('ativo', true);
            
        if (error) throw new Error("Erro ao buscar usuários: " + error.message);

        // MAPA 1: Por ID (Prioridade Máxima)
        const mapPorID = {};
        // MAPA 2: Por Nome Normalizado
        const mapPorNome = {};

        usersDB.forEach(u => {
            mapPorID[u.id] = u.id; // Mapa simples de existência
            mapPorNome[this.normalizarTexto(u.nome)] = u.id;
        });

        const updates = [];
        const erros = [];
        
        // 2. Processar linhas
        for (const row of dadosBrutos) {
            // Ignora totalizações
            const rowString = JSON.stringify(row).toLowerCase();
            if (rowString.includes("total geral")) continue;
            if (row['assistente'] && row['assistente'].toString().toLowerCase() === 'total') continue;

            const keys = Object.keys(row);
            
            // --- ESTRATÉGIA DE MAPEAMENTO ---
            
            // 1. Busca colunas de Identificação
            const keyId = keys.find(k => {
                const n = this.normalizarTexto(k);
                return n === 'id' || n === 'idassistente' || n === 'cod' || n === 'matricula';
            });
            
            const keyNome = keys.find(k => {
                const n = this.normalizarTexto(k);
                return (n.includes('assistente') || n.includes('nome')) && !n.includes('id');
            });

            // 2. Busca colunas de Valores
            const keyTotal = keys.find(k => k.trim() === 'documentos_validados') || keys.find(k => this.normalizarTexto(k).includes('quantidade'));
            const keyFifo = keys.find(k => this.normalizarTexto(k).includes('fifo'));
            const keyGT = keys.find(k => this.normalizarTexto(k).includes('gradual total'));
            const keyGP = keys.find(k => this.normalizarTexto(k).includes('gradual parcial'));
            const keyPFC = keys.find(k => this.normalizarTexto(k).includes('perfil fc'));

            let uid = null;
            let metodoEncontrado = "";

            // TENTATIVA A: Pelo ID (Infalível)
            if (keyId && row[keyId]) {
                const idArquivo = parseInt(row[keyId]);
                if (mapPorID[idArquivo]) {
                    uid = idArquivo;
                    metodoEncontrado = "ID";
                }
            }

            // TENTATIVA B: Pelo Nome Exato
            if (!uid && keyNome && row[keyNome]) {
                const nomePlanilha = this.normalizarTexto(row[keyNome]);
                if (mapPorNome[nomePlanilha]) {
                    uid = mapPorNome[nomePlanilha];
                    metodoEncontrado = "Nome Exato";
                }
            }

            // TENTATIVA C: Pelo Nome Parcial (Contém)
            // Ex: Banco="Thayla" contido em Excel="Thayla Herpet"
            if (!uid && keyNome && row[keyNome]) {
                const nomePlanilha = this.normalizarTexto(row[keyNome]);
                // Procura algum usuário do banco cujo nome esteja contido na planilha OU vice-versa
                const match = usersDB.find(u => {
                    const nomeBanco = this.normalizarTexto(u.nome);
                    return nomePlanilha.includes(nomeBanco) || nomeBanco.includes(nomePlanilha);
                });
                
                if (match) {
                    uid = match.id;
                    metodoEncontrado = "Nome Parcial";
                }
            }

            if (uid) {
                // Monta o objeto SEM o updated_at para evitar o erro do banco
                updates.push({
                    usuario_id: uid,
                    data_referencia: dataReferencia,
                    quantidade: this.limparNumero(row[keyTotal]),
                    fifo: this.limparNumero(row[keyFifo]),
                    gradual_total: this.limparNumero(row[keyGT]),
                    gradual_parcial: this.limparNumero(row[keyGP]),
                    perfil_fc: this.limparNumero(row[keyPFC])
                });
            } else {
                // Só reporta erro se tiver um nome válido na linha e não for lixo
                if (keyNome && row[keyNome] && row[keyNome].toString().length > 3) {
                    erros.push(`${row[keyNome]} (ID na planilha: ${keyId ? row[keyId] : 'sem coluna ID'})`);
                }
            }
        }

        // 3. Enviar para o Banco
        if (updates.length > 0) {
            console.log(`Enviando ${updates.length} registros...`);
            const { error: upsertError } = await _supabase
                .from('producao')
                .upsert(updates, { onConflict: 'usuario_id, data_referencia' });

            if (upsertError) throw upsertError;
        }

        return {
            sucesso: true,
            qtdImportada: updates.length,
            nomesNaoEncontrados: [...new Set(erros)]
        };
    },
    
    diagnosticarBanco: async function() {
        const { data } = await _supabase.from('usuarios').select('*');
        console.table(data);
    }
};