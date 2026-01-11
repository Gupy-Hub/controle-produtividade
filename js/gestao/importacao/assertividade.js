// Namespace para organizar as importações
window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    // Chamado quando você escolhe o arquivo
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo arquivo...</span>`;

        // Usa PapaParse para ler o CSV
        Papa.parse(arquivo, {
            header: true, // Usa a primeira linha como cabeçalho
            skipEmptyLines: true,
            encoding: "UTF-8", // Tenta forçar UTF-8 para acentos
            complete: async (results) => {
                await this.enviarParaBanco(results.data);
                input.value = ""; // Limpa para permitir selecionar o mesmo arquivo de novo
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                statusEl.innerText = "Erro na leitura.";
            }
        });
    },

    // Envia os dados lidos para o Supabase
    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;

        // Limite de lote para não travar o navegador (envia de 50 em 50)
        const TAMANHO_LOTE = 50;
        const total = linhas.length;

        statusEl.innerHTML = `<span class="text-orange-500">Iniciando importação de ${total} registros...</span>`;

        // Prepara os dados (Mapeamento CSV -> Banco)
        const dadosFormatados = linhas.map(linha => {
            // Conversão de Data (DD/MM/YYYY -> YYYY-MM-DD)
            let dataFormatada = null;
            if (linha['Data da Auditoria']) {
                const partes = linha['Data da Auditoria'].split('/');
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }

            // Tratamento de Números
            const campos = parseInt(linha['nº Campos']) || 0;
            const ok = parseInt(linha['Ok']) || 0;
            const nok = parseInt(linha['Nok']) || 0;

            // Retorna objeto pronto para o Supabase
            return {
                data_auditoria: dataFormatada,
                company_id: linha['Company_id'] || null,
                empresa: linha['Empresa'] || linha['Nome da PPC'] || 'Desconhecida',
                assistente: linha['Assistente'] || linha['id_assistente'],
                doc_name: linha['doc_name'] || linha['DOCUMENTO'],
                status: linha['STATUS'] || 'PENDENTE',
                obs: linha['Apontamentos/obs'] || '',
                campos: campos,
                ok: ok,
                nok: nok,
                porcentagem: linha['% Assert'] || '0%',
                auditora: linha['Auditora'] || 'Sistema'
            };
        }).filter(d => d.data_auditoria); // Remove linhas sem data válida (cabeçalhos perdidos ou lixo)

        // Envio em Lotes (Batch Insert)
        for (let i = 0; i < dadosFormatados.length; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            
            statusEl.innerText = `Enviando lote ${Math.ceil(i/TAMANHO_LOTE) + 1}... (${i}/${total})`;
            
            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);

            if (error) {
                console.error("Erro no lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        // Finalização
        statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Sucesso: ${sucesso} | Falhas: ${erros}</span>`;
        
        if (sucesso > 0) {
            // Recarrega a tabela de listagem para ver os dados novos
            if(Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }
            alert(`Importação concluída!\n${sucesso} registros importados.`);
        }
    }
};