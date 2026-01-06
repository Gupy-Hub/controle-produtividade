const Importacao = {
    // Utilitário para normalizar strings (remove acentos e espaços extras) para comparação
    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto.toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .trim().replace(/\s+/g, " "); // Remove espaços duplos
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

                    // TENTATIVA 1: Ler como Excel padrão (XLSX)
                    try {
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (erroExcel) {
                        console.warn("Não é um XLSX padrão, tentando ler como CSV...", erroExcel);
                        
                        // TENTATIVA 2: Ler como Texto/CSV (Fallback para o erro Bad uncompressed size)
                        try {
                            const decoder = new TextDecoder('utf-8'); // Tenta UTF-8
                            const text = decoder.decode(data);
                            workbook = XLSX.read(text, { type: 'string', raw: true });
                        } catch (erroCSV) {
                            // TENTATIVA 3: Tenta codificação antiga (ISO-8859-1) se UTF-8 falhar
                            const decoder = new TextDecoder('iso-8859-1');
                            const text = decoder.decode(data);
                            workbook = XLSX.read(text, { type: 'string', raw: true });
                        }
                    }
                    
                    // Detecção de data no nome do arquivo
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
                    reject("Erro fatal ao ler arquivo. Verifique se não está corrompido.");
                }
            };
            
            reader.onerror = () => reject("Erro de leitura do arquivo.");
            reader.readAsArrayBuffer(file);
        });
    },

    processar: async function(dadosBrutos, dataReferencia) {
        if (!dataReferencia) throw new Error("Data de referência é obrigatória.");

        console.log("--- INICIANDO IMPORTAÇÃO ---");

        // 1. Carregar usuários do Supabase
        const { data: usersDB, error } = await _supabase
            .from('usuarios')
            .select('id, nome, funcao, ativo')
            .eq('ativo', true);
            
        if (error) throw new Error("Erro ao buscar usuários: " + error.message);

        // Mapa: Nome Normalizado -> ID
        const mapPorNome = {};
        usersDB.forEach(u => {
            mapPorNome[this.normalizarTexto(u.nome)] = u.id;
        });

        // --- DIAGNÓSTICO DE NOMES ---
        // Isso vai ajudar você a ver o que está acontecendo no Console (F12)
        console.table(usersDB.map(u => ({ 
            id: u.id, 
            nome_banco: u.nome, 
            nome_normalizado: this.normalizarTexto(u.nome) 
        })).slice(0, 10)); // Mostra os 10 primeiros para conferência

        const updates = [];
        const erros = [];
        let importados = 0;

        // 2. Processar linhas
        for (const row of dadosBrutos) {
            // Ignora linhas de totais
            const valuesStr = Object.values(row).join(" ").toLowerCase();
            if (valuesStr.includes("total geral") || (row['assistente'] && row['assistente'].toString().toLowerCase() === 'total')) {
                continue;
            }

            const keys = Object.keys(row);
            
            // FUNÇÃO INTELIGENTE DE BUSCA DE COLUNA
            // excludeId = true impede que ele pegue 'id_assistente' quando procuramos 'assistente'
            const getKey = (substring, excludeId = false) => keys.find(k => {
                const norm = this.normalizarTexto(k);
                if (excludeId && (norm.startsWith('id') || norm.includes('cod') || norm === 'id')) return false;
                return norm.includes(substring);
            });
            
            // Busca campos chave
            const keyNome = getKey("assistente", true) || getKey("analista", true) || getKey("nome", true) || getKey("funcionario", true);
            
            // Busca métricas
            const keyTotal = keys.find(k => k.trim() === 'documentos_validados') || getKey("quantidade");
            const keyFifo = getKey("fifo");
            const keyGT = getKey("gradual_total") || getKey("gradual total");
            const keyGP = getKey("gradual_parcial") || getKey("gradual parcial");
            const keyPFC = getKey("perfil_fc") || getKey("perfil fc");

            if (!keyNome) continue; 

            const nomePlanilha = row[keyNome];
            if (!nomePlanilha) continue;

            const nomeNorm = this.normalizarTexto(nomePlanilha);
            let uid = mapPorNome[nomeNorm];

            if (uid) {
                const parseNum = (val) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    const clean = val.toString().replace(/\./g, '').replace(',', '.');
                    return parseInt(clean) || 0;
                };

                updates.push({
                    usuario_id: uid,
                    data_referencia: dataReferencia,
                    quantidade: parseNum(row[keyTotal]),
                    fifo: parseNum(row[keyFifo]),
                    gradual_total: parseNum(row[keyGT]),
                    gradual_parcial: parseNum(row[keyGP]),
                    perfil_fc: parseNum(row[keyPFC]),
                    updated_at: new Date()
                });
            } else {
                // Registra o erro para exibir depois
                // Verifica se não é um número (ID) que foi pego errado
                if (isNaN(nomePlanilha)) {
                    erros.push(nomePlanilha);
                    console.warn(`Não encontrado: "${nomePlanilha}" (Normalizado: "${nomeNorm}")`);
                }
            }
        }

        // 3. Persistência
        if (updates.length > 0) {
            const { error: upsertError } = await _supabase
                .from('producao')
                .upsert(updates, { onConflict: 'usuario_id, data_referencia' });

            if (upsertError) throw upsertError;
            importados = updates.length;
        }

        return {
            sucesso: true,
            qtdImportada: importados,
            nomesNaoEncontrados: [...new Set(erros)] // Remove duplicados
        };
    },

    // --- FERRAMENTA DE DIAGNÓSTICO MANUAL ---
    // Rode Importacao.diagnosticarBanco() no Console para ver seus usuários
    diagnosticarBanco: async function() {
        const { data: users } = await _supabase.from('usuarios').select('*').eq('ativo', true).order('nome');
        console.log("=== LISTA DE USUÁRIOS ATIVOS NO BANCO ===");
        console.table(users.map(u => ({ ID: u.id, Nome: u.nome, 'Nome Normalizado': this.normalizarTexto(u.nome) })));
        alert("Lista de usuários gerada no Console (Pressione F12 para ver).");
    }
};