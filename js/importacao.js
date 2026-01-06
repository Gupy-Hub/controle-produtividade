const Importacao = {
    // Função auxiliar para normalizar texto (mantida pois é usada no mapeamento)
    normalizar: function(texto) {
        if (!texto) return "";
        return texto.toString().toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
    },

    lerArquivo: function(origem) {
        return new Promise((resolve, reject) => {
            const file = origem.files ? origem.files[0] : origem;
            if (!file) return reject("Nenhum arquivo identificado.");

            const reader = new FileReader();

            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                let workbook = null;
                let erroDetalhado = "";

                // --- ETAPA 1: Identificação do Tipo de Arquivo ---
                // Verifica se começa com 'PK' (0x50 0x4B), assinatura de arquivos ZIP/XLSX
                const isZip = data.length > 1 && data[0] === 0x50 && data[1] === 0x4B;

                try {
                    if (isZip) {
                        // --- ETAPA 2: Tratamento de Excel (ZIP) ---
                        
                        // TENTATIVA A: Modo Array (Padrão e Rápido)
                        try {
                            workbook = XLSX.read(data, { type: 'array', cellDates: true });
                        } catch (errArray) {
                            console.warn("Tentativa A (Array) falhou. Tentando modo Binário...", errArray);
                            erroDetalhado += `Array: ${errArray.message}; `;

                            // TENTATIVA B: Modo Binário (Correção para 'Bad uncompressed size')
                            // Esta é a única forma de abrir Excels com cabeçalhos de tamanho corrompidos
                            try {
                                let binary = "";
                                const len = data.byteLength;
                                // Loop manual para garantir conversão byte-a-byte sem corrupção de encoding
                                for (let i = 0; i < len; i++) {
                                    binary += String.fromCharCode(data[i]);
                                }
                                workbook = XLSX.read(binary, { type: 'binary', cellDates: true });
                            } catch (errBinary) {
                                console.warn("Tentativa B (Binário) falhou.", errBinary);
                                erroDetalhado += `Binary: ${errBinary.message}; `;
                                throw new Error("Falha total na leitura do Excel (ZIP).");
                            }
                        }
                    } else {
                        // --- ETAPA 3: Tratamento de CSV/Texto ---
                        // Se não é ZIP, assumimos que é CSV ou Texto Simples
                        throw new Error("Não é um arquivo Excel (ZIP). Passando para parser de texto.");
                    }

                } catch (errZip) {
                    // --- ETAPA 4: Fallback Final (CSV/Texto) ---
                    // Se falhou como ZIP (ou não era ZIP), tentamos ler como Texto
                    console.warn("Entrando no Fallback de Texto/CSV...", errZip);
                    
                    try {
                        // Tenta decodificar como ISO-8859-1 (comum no Brasil para CSVs de sistemas legados)
                        // Se falhar caracteres, o UTF-8 seria a outra opção, mas ISO costuma ser o padrão desses erros.
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: false });
                    } catch (errText) {
                        console.error("Todas as tentativas falharam.");
                        return reject(`Não foi possível ler o arquivo. Erros: ${erroDetalhado} Texto: ${errText.message}`);
                    }
                }

                // --- ETAPA 5: Processamento dos Dados ---
                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    return reject("O arquivo parece vazio ou inválido (nenhuma planilha encontrada).");
                }

                try {
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Converte para JSON. 'defval: ""' garante que células vazias venham como string vazia
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });

                    // Tenta extrair a data do nome do arquivo (ex: 05012026 -> 2026-01-05)
                    let dataDetectada = null;
                    const regexData = /(\d{2})[-/.]?(\d{2})[-/.]?(\d{4})/; // Pega DD-MM-YYYY
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        // Converte para formato ISO (YYYY-MM-DD) para o input HTML e Banco
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`; 
                    }

                    console.log(`Sucesso! Arquivo: ${file.name}, Linhas: ${jsonData.length}`);
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });

                } catch (errParse) {
                    reject(`Erro ao processar dados da planilha: ${errParse.message}`);
                }
            };

            reader.onerror = () => reject("Erro de leitura do arquivo (FileReader).");
            reader.readAsArrayBuffer(file);
        });
    },

    // Mantido para compatibilidade, caso seja chamado externamente
    processar: async function() { return { qtdImportada: 0, nomesNaoEncontrados: [] }; } 
};