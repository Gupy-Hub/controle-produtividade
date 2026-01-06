const Importacao = {
    // Apenas utilitários de texto e leitura
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
                        // Tenta ler como Excel padrão
                        workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    } catch (e1) {
                        // Se falhar, tenta ler como CSV (ISO-8859-1 comum no Brasil)
                        const decoder = new TextDecoder('iso-8859-1');
                        const text = decoder.decode(data);
                        workbook = XLSX.read(text, { type: 'string', raw: true });
                    }
                    
                    // Tenta extrair data do nome do arquivo (Ex: 05012026.xlsx)
                    let dataDetectada = null;
                    const regexData = /(\d{2})(\d{2})(\d{4})/;
                    const match = file.name.match(regexData);
                    if (match) {
                        // YYYY-MM-DD
                        dataDetectada = `${match[3]}-${match[2]}-${match[1]}`;
                    }

                    const firstSheet = workbook.SheetNames[0];
                    // raw: false ajuda a evitar erros de data no Excel, mas raw: true é melhor para CSVs puros.
                    // Usaremos false para tentar interpretar tipos.
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
                    
                    resolve({ dados: jsonData, dataSugestionada: dataDetectada, nomeArquivo: file.name });
                } catch (err) {
                    reject("Erro crítico ao ler arquivo: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
};