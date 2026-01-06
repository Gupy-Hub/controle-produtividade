const Importacao = {
    normalizar: function(texto) {
        if (!texto) return "";
        return texto.toString().toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
    },

    lerArquivo: function(origem) {
        return new Promise((resolve, reject) => {
            // Verifica se 'origem' é um input HTML (tem .files) ou se já é o arquivo direto
            const file = origem.files ? origem.files[0] : origem;
            
            if (!file) return reject("Nenhum arquivo identificado.");

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    let workbook;
                    
                    // Verifica assinatura do arquivo (Magic Bytes)
                    // Arquivos XLSX reais (ZIP) começam com os bytes: 50 4B 03 04 (PK..)
                    const isZip = data.length > 4 && 
                                  data[0] === 0x50 && data[1] === 0x4B && 
                                  data[2] === 0x03 && data[3] === 0x04;

                    if (isZip) {
                        try {
                            // TENTATIVA 1: Leitura Padrão (Array)
                            workbook = XLSX.read(data, { type: 'array', cellDates: true });
                        } catch (eZip) {
                            console.warn("Erro na leitura padrão (Array). Tentando modo Binário...", eZip);
                            
                            try {
                                // TENTATIVA 2: Workaround para erro "Bad uncompressed size"
                                // Converte o buffer para string binária manualmente
                                let binary = "";
                                const len = data.byteLength;
                                for (let i = 0; i < len; i++) {
                                    binary += String.fromCharCode(data[i]);
                                }
                                
                                workbook = XLSX.read(binary, { type: 'binary', cellDates: true });
                            
                            } catch (eBin) {
                                console.warn("Erro na leitura Binária. Tentando como Texto/CSV...", eBin);
                                // TENTATIVA 3: Fallback final (Texto/CSV)
                                const decoder = new TextDecoder('iso-8859-1');
                                const text = decoder.decode(data);
                                workbook = XLSX.read(text, { type: 'string', raw: true });
                            }
                        }
                    } else {
                        // NÃO é um Excel real (é CSV/Texto com extensão .xlsx)
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: true });
                    }
                    
                    // Detecção de data no nome (DDMMYYYY ou YYYY-MM-DD)
                    let dataDetectada = null;
                    const regexData = /(\d{2})[-/.]?(\d{2})[-/.]?(\d{4})/;
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        // Assume formato Dia-Mes-Ano se vier do nome brasileiro (ex: 05012026)
                        // Converte para YYYY-MM-DD para o banco
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`; 
                    }

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