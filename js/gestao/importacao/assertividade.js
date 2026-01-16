/**
 * PERFORMANCE PRO - MÓDULO DE IMPORTAÇÃO DE ASSERTIVIDADE
 * Foco: Flexibilidade de nomes de arquivos e integridade de dados.
 */

const ImportadorAssertividade = {
    async processarArquivo(file) {
        console.log(`%c iniciada importação: ${file.name}`, "color: #2563eb; font-weight: bold;");
        
        const leitor = new FileReader();
        
        leitor.onload = async (e) => {
            const texto = e.target.result;
            const linhas = texto.split(/\r?\n/);
            
            if (linhas.length < 2) {
                alert("O arquivo está vazio ou sem dados.");
                return;
            }

            // Detectar cabeçalho e mapear colunas
            const cabecalho = linhas[0].toLowerCase().split(';');
            const dadosParaInserir = [];

            for (let i = 1; i < linhas.length; i++) {
                if (!linhas[i].trim()) continue;

                const colunas = linhas[i].split(';');
                
                // Mapeamento dinâmico baseado na estrutura da tabela 'assertividade'
                const registro = {
                    usuario_id: this.extrairIdUsuario(colunas, cabecalho),
                    data_referencia: this.formatarData(colunas[cabecalho.indexOf('data')]),
                    id_ppc: colunas[cabecalho.indexOf('id ppc')] || colunas[cabecalho.indexOf('id')],
                    status: colunas[cabecalho.indexOf('status')] || 'Finalizado',
                    created_at: new Date().toISOString()
                };

                if (registro.usuario_id) {
                    dadosParaInserir.push(registro);
                }
            }

            await this.salvarNoBanco(dadosParaInserir, file.name);
        };

        leitor.readAsText(file, 'ISO-8859-1'); // Comum em CSVs exportados de sistemas brasileiros
    },

    extrairIdUsuario(colunas, cabecalho) {
        const idx = cabecalho.indexOf('usuario_id') !== -1 ? cabecalho.indexOf('usuario_id') : cabecalho.indexOf('id_assistente');
        return colunas[idx] ? parseInt(colunas[idx]) : null;
    },

    formatarData(dataRaw) {
        if (!dataRaw) return null;
        // Converte DD/MM/YYYY para YYYY-MM-DD (Formato Postgres)
        const partes = dataRaw.split('/');
        if (partes.length === 3) {
            return `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
        return dataRaw;
    },

    async salvarNoBanco(dados, nomeArquivo) {
        try {
            // Lógica de Upsert baseada no ID PPC para evitar duplicados
            const { data, error } = await Sistema.supabase
                .from('assertividade')
                .upsert(dados, { onConflict: 'id_ppc' });

            if (error) throw error;

            alert(`Sucesso! Importação do arquivo "${nomeArquivo}" concluída com ${dados.length} registros.`);
            console.log("Importação concluída com sucesso.");
            
            if (typeof GerenciadorAssertividade !== 'undefined') {
                GerenciadorAssertividade.init(); // Recarrega a tabela na tela
            }

        } catch (error) {
            console.error("Erro na importação:", error);
            alert("Erro ao salvar no banco. Verifique o console.");
        }
    }
};

// Listener para o input de arquivo na página de gestão
document.getElementById('input-csv-assertividade')?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        ImportadorAssertividade.processarArquivo(e.target.files[0]);
    }
});