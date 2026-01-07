const Importacao = {
    // Função auxiliar para normalizar nomes (remove acentos e espaços extras)
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
                try {
                    const data = new Uint8Array(e.target.result);
                    let workbook;
                    
                    // CORREÇÃO: Passamos o buffer direto para a biblioteca XLSX.
                    // Ela detecta automaticamente se é ZIP (Excel) ou Texto (CSV) e tenta adivinhar o encoding (UTF-8 vs ANSI)
                    try {
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (eRead) {
                        // Fallback: Se falhar, tenta forçar leitura como texto (ISO-8859-1 para legados BR)
                        console.warn("Falha na detecção automática, tentando forçar ISO-8859-1...");
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: false });
                    }
                    
                    // Detecção de data no nome do arquivo (ex: 02012026.csv -> 2026-01-02)
                    let dataDetectada = null;
                    const regexData = /(\d{2})[-/.]?(\d{2})[-/.]?(\d{4})/;
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        // Converte para YYYY-MM-DD para salvar no banco
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`; 
                    }

                    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                        throw new Error("O arquivo parece vazio ou inválido.");
                    }

                    const firstSheet = workbook.SheetNames[0];
                    // 'defval: ""' garante que células vazias não quebrem o layout
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });

                } catch (err) {
                    console.error(err);
                    reject(`Erro ao ler ${file.name}: ${err.message}`);
                }
            };
            
            reader.onerror = () => reject("Erro de leitura do arquivo.");
            reader.readAsArrayBuffer(file);
        });
    },

    processar: async function() { return { qtdImportada: 0, nomesNaoEncontrados: [] }; } 
};