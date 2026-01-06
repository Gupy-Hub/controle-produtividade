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
                    try {
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (e1) {
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: true });
                    }
                    
                    // Detecção de data no nome (DDMMYYYY ou YYYY-MM-DD)
                    let dataDetectada = null;
                    // Regex para pegar 05012026 ou 05-01-2026
                    const regexData = /(\d{2})[-/.]?(\d{2})[-/.]?(\d{4})/;
                    const match = file.name.match(regexData);
                    
                    if (match) {
                        // Assume formato Dia-Mes-Ano se vier do nome brasileiro
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD para o banco
                    }

                    const firstSheet = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    reject(`Erro ao ler ${file.name}: ${err.message}`);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // (Opcional) Função genérica de processar mantida apenas para compatibilidade, 
    // mas estamos usando a lógica específica no main.js de cada módulo.
    processar: async function() { return { qtdImportada: 0, nomesNaoEncontrados: [] }; } 
};