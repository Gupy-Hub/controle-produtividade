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
                    
                    // Verifica assinatura do arquivo (Magic Bytes)
                    // Se começar com 50 4B 03 04, é um Excel/ZIP real.
                    const isZip = data.length > 4 && 
                                  data[0] === 0x50 && data[1] === 0x4B && 
                                  data[2] === 0x03 && data[3] === 0x04;

                    if (isZip) {
                        // Se for Excel (.xlsx), tenta ler modo binário para evitar erros de compressão
                        try {
                            let binary = "";
                            const len = data.byteLength;
                            for (let i = 0; i < len; i++) {
                                binary += String.fromCharCode(data[i]);
                            }
                            workbook = XLSX.read(binary, { type: 'binary', cellDates: true });
                        } catch (eBin) {
                            console.warn("Falha no modo binário, tentando array...", eBin);
                            workbook = XLSX.read(data, { type: 'array', cellDates: true });
                        }
                    } else {
                        // --- TRATAMENTO DE CSV ---
                        // Decodifica como texto usando ISO-8859-1 (padrão Brasil/Excel)
                        const decoder = new TextDecoder('iso-8859-1'); 
                        const text = decoder.decode(data);
                        
                        // Lê o texto como planilha
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