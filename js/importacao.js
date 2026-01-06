const Importacao = {
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
                    
                    // Verifica se é um arquivo Excel/ZIP real (assinatura PK...)
                    const isZip = data.length > 4 && 
                                  data[0] === 0x50 && data[1] === 0x4B && 
                                  data[2] === 0x03 && data[3] === 0x04;

                    if (isZip) {
                        try {
                            // ESTRATÉGIA MUDADA: Tenta o Modo Seguro (Binário) PRIMEIRO
                            // Isso evita que o erro "Bad uncompressed size" sequer apareça na consola
                            let binary = "";
                            const len = data.byteLength;
                            for (let i = 0; i < len; i++) {
                                binary += String.fromCharCode(data[i]);
                            }
                            workbook = XLSX.read(binary, { type: 'binary', cellDates: true });
                        
                        } catch (eBin) {
                            // Se o modo binário falhar (muito raro), tenta o modo Array como fallback
                            console.warn("Modo Seguro falhou, tentando padrão...", eBin);
                            workbook = XLSX.read(data, { type: 'array', cellDates: true });
                        }
                    } else {
                        // Não é ZIP (provavelmente CSV renomeado ou texto simples)
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: true });
                    }
                    
                    // Detecção de data e formatação final
                    let dataDetectada = null;
                    const regexData = /(\d{2})[-/.]?(\d{2})[-/.]?(\d{4})/;
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`; 
                    }

                    if (!workbook || !workbook.SheetNames.length) throw new Error("Arquivo vazio ou ilegível.");

                    const firstSheet = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    console.error(err);
                    reject(`Erro ao ler ${file.name}: ${err.message}`);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    },

    processar: async function() { return { qtdImportada: 0, nomesNaoEncontrados: [] }; } 
};