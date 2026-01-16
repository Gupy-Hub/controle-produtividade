/**
 * PERFORMANCE PRO - Módulo de Importação de Assertividade
 * Responsável por processar CSVs mensais e realizar Upsert no Supabase.
 */

const ImportadorAssertividade = {
    async processarArquivo(file) {
        if (!file) return;

        console.log(`%c 📑 Iniciando processamento: ${file.name}`, "color: #2563eb; font-weight: bold;");
        
        const leitor = new FileReader();
        leitor.onload = async (e) => {
            try {
                const texto = e.target.result;
                const linhas = texto.split(/\r?\n/);
                
                if (linhas.length < 2) {
                    throw new Error("O arquivo selecionado está vazio.");
                }

                // Identifica o delimitador (ponto e vírgula comum em Excel BR ou vírgula)
                const delimitador = linhas[0].includes(';') ? ';' : ',';
                const cabecalho = linhas[0].toLowerCase().split(delimitador).map(c => c.trim());
                
                const registros = [];

                for (let i = 1; i < linhas.length; i++) {
                    const linha = linhas[i].trim();
                    if (!linha) continue;

                    const col = linha.split(delimitador);
                    
                    // Mapeamento dinâmico baseado no cabeçalho do CSV
                    const item = {
                        nome_documento: col[cabecalho.indexOf('documento')] || col[cabecalho.indexOf('nome_documento')],
                        data_auditoria: this.formatarData(col[cabecalho.indexOf('data')] || col[cabecalho.indexOf('data_auditoria')]),
                        qtd_ok: parseInt(col[cabecalho.indexOf('ok')] || col[cabecalho.indexOf('qtd_ok')]) || 0,
                        qtd_nok: parseInt(col[cabecalho.indexOf('nok')] || col[cabecalho.indexOf('qtd_nok')]) || 0,
                        num_campos: parseInt(col[cabecalho.indexOf('campos')] || col[cabecalho.indexOf('num_campos')]) || 0,
                        usuario_id: parseInt(col[cabecalho.indexOf('usuario_id')]) || null,
                        status: 'Finalizado',
                        created_at: new Date().toISOString()
                    };

                    // Só adiciona se tiver o nome do documento (chave única no banco)
                    if (item.nome_documento) {
                        registros.push(item);
                    }
                }

                if (registros.length === 0) {
                    throw new Error("Nenhum registro válido encontrado no CSV.");
                }

                // Envio para o banco usando a Constraint de Unicidade
                const { error } = await Sistema.supabase
                    .from('assertividade')
                    .upsert(registros, { onConflict: 'nome_documento,data_auditoria' });

                if (error) throw error;

                alert(`✅ Sucesso! ${registros.length} registros processados do arquivo: ${file.name}`);
                
            } catch (err) {
                console.error("❌ Erro na Importação:", err);
                alert("Falha ao processar CSV: " + err.message);
            } finally {
                // Reseta o input para permitir importar o mesmo arquivo novamente se necessário
                document.getElementById('input-csv-assertividade').value = '';
            }
        };

        // Lê como ISO-8859-1 para suportar acentos do Excel Brasil
        leitor.readAsText(file, 'ISO-8859-1');
    },

    /**
     * Converte datas do formato brasileiro (DD/MM/YYYY) para ISO (YYYY-MM-DD)
     */
    formatarData(dataRaw) {
        if (!dataRaw) return new Date().toISOString().split('T')[0];
        
        const partes = dataRaw.trim().split('/');
        if (partes.length === 3) {
            // Garante o preenchimento de zeros (Ex: 1/12/2025 -> 2025-12-01)
            const dia = partes[0].padStart(2, '0');
            const mes = partes[1].padStart(2, '0');
            const ano = partes[2];
            return `${ano}-${mes}-${dia}`;
        }
        return dataRaw;
    }
};

/**
 * VINCULAÇÃO AUTOMÁTICA DE EVENTOS (DOM READY)
 * Garante que o script funcione independente de onde for declarado no HTML.
 */
document.addEventListener('DOMContentLoaded', () => {
    const btnImportar = document.getElementById('input-csv-assertividade');
    if (btnImportar) {
        btnImportar.addEventListener('change', (event) => {
            const arquivo = event.target.files[0];
            ImportadorAssertividade.processarArquivo(arquivo);
        });
        console.log("✅ Listener de Assertividade vinculado com sucesso.");
    }
});