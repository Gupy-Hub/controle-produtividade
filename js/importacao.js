{
type: "file",
fileName: "js/importacao.js",
content: `
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
                    // Lê o arquivo tentando detectar o formato automaticamente
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    
                    // Tenta detectar a data pelo nome do arquivo (procura qualquer sequência de 8 dígitos)
                    // Ex: "Relatorio_05012026.csv" ou "05012026.xlsx"
                    let dataDetectada = null;
                    const regexData = /(\d{2})(\d{2})(\d{4})/;
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        // match[1]=Dia, match[2]=Mes, match[3]=Ano -> YYYY-MM-DD
                        dataDetectada = \`\${match[3]}-\${match[2]}-\${match[1]}\`;
                    }

                    const firstSheet = workbook.SheetNames[0];
                    // O parâmetro raw: false ajuda a interpretar valores corretamente
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    reject("Erro ao processar o arquivo Excel/CSV: " + err.message);
                }
            };
            
            reader.onerror = () => reject("Erro de leitura do arquivo.");
            reader.readAsArrayBuffer(file);
        });
    },

    processar: async function(dadosBrutos, dataReferencia) {
        if (!dataReferencia) {
            throw new Error("Data de referência é obrigatória.");
        }

        // 1. Carregar usuários para mapeamento
        // Trazemos ID, Nome e também um campo de código externo se existir (opcional)
        const { data: usersDB, error } = await _supabase
            .from('usuarios')
            .select('id, nome')
            .eq('ativo', true); // Otimização: Só carrega ativos
            
        if (error) throw new Error("Erro ao buscar usuários: " + error.message);

        // Cria mapas para busca rápida
        const mapPorNome = {};
        
        usersDB.forEach(u => {
            // Mapeia pelo nome normalizado
            mapPorNome[this.normalizarTexto(u.nome)] = u.id;
        });

        const updates = [];
        const erros = [];
        let importados = 0;

        // 2. Processar linhas
        for (const row of dadosBrutos) {
            // Ignora linhas de totalização
            const valuesStr = Object.values(row).join(" ").toLowerCase();
            if (valuesStr.includes("total geral") || (row['assistente'] && row['assistente'].toString().toLowerCase() === 'total')) {
                continue;
            }

            // --- Estratégia de Identificação das Colunas ---
            // Tenta encontrar as chaves corretas independente de Case ou espaços
            const keys = Object.keys(row);
            const getKey = (substring) => keys.find(k => this.normalizarTexto(k).includes(substring));
            
            // Busca campos chave
            const keyNome = getKey("assistente") || getKey("analista") || getKey("nome");
            
            // Busca métricas (prioriza nomes exatos da sua planilha)
            const keyTotal = keys.find(k => k.trim() === 'documentos_validados') || getKey("quantidade");
            const keyFifo = getKey("fifo");
            const keyGT = getKey("gradual_total") || getKey("gradual total");
            const keyGP = getKey("gradual_parcial") || getKey("gradual parcial");
            const keyPFC = getKey("perfil_fc") || getKey("perfil fc");

            if (!keyNome) continue; // Linha sem nome de assistente, pula

            const nomePlanilha = row[keyNome];
            if (!nomePlanilha) continue;

            // --- Estratégia de Identificação do Usuário ---
            // 1. Tenta match exato de nome normalizado
            let uid = mapPorNome[this.normalizarTexto(nomePlanilha)];

            // Se encontrou usuário
            if (uid) {
                // Parse seguro de números (remove pontos de milhar se houver, troca virgula por ponto)
                const parseNum = (val) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    const clean = val.toString().replace(/\./g, '').replace(',', '.');
                    return parseInt(clean) || 0;
                };

                const payload = {
                    usuario_id: uid,
                    data_referencia: dataReferencia,
                    quantidade: parseNum(row[keyTotal]),
                    fifo: parseNum(row[keyFifo]),
                    gradual_total: parseNum(row[keyGT]),
                    gradual_parcial: parseNum(row[keyGP]),
                    perfil_fc: parseNum(row[keyPFC]),
                    updated_at: new Date()
                };

                // Adiciona à fila de processamento
                updates.push(payload);
            } else {
                erros.push(nomePlanilha);
            }
        }

        // 3. Persistência em Lote (Mais performático que um por um)
        if (updates.length > 0) {
            // O Supabase suporta upsert em array
            const { error: upsertError } = await _supabase
                .from('producao')
                .upsert(updates, { onConflict: 'usuario_id, data_referencia' });

            if (upsertError) throw upsertError;
            importados = updates.length;
        }

        return {
            sucesso: true,
            qtdImportada: importados,
            nomesNaoEncontrados: erros
        };
    }
};
`
}