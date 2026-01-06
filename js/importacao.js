// Arquivo: js/importacao.js
const Importacao = {
    normalizar: function(texto) {
        if (!texto) return "";
        return texto.toString().toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
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
                    try {
                        // Tenta ler como XLSX padrão
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (e1) {
                        // Fallback para CSV com codificação antiga (ISO-8859-1)
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: true });
                    }
                    
                    // Detecta data no nome do arquivo (ex: 05012026.xlsx)
                    let dataDetectada = null;
                    const regexData = /(\d{2})(\d{2})(\d{4})/;
                    const match = file.name.match(regexData);
                    if (match) dataDetectada = `${match[3]}-${match[2]}-${match[1]}`;

                    const firstSheet = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    reject("Erro ao ler arquivo: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
};