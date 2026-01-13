window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Analisando arquivo...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                // Transforma tudo em minúsculo e remove aspas para evitar erro de 'Status' vs 'STATUS'
                return header.trim().replace(/"/g, '').toLowerCase();
            },
            complete: async (results) => {
                if (results.data.length === 0) {
                    alert("Arquivo vazio ou ilegível.");
                    statusEl.innerText = "";
                    return;
                }
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro leitura: " + err.message);
                statusEl.innerText = "Erro.";
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;
        const TAMANHO_LOTE = 200;

        // Mapeamento dos dados
        const dadosFormatados = linhas.map(linha => {
            
            // 1. DATA (Procura por varias colunas possíveis)
            let valData = linha['data da auditoria'] || linha['data'] || linha['data_auditoria'] || linha['end_time'];
            let origemData = 'AUDITORIA';

            if (!valData) return null; // Sem data = Lixo

            // Tratamento de Data
            let dataFormatada = null;
            if (valData.includes('T')) dataFormatada = valData.split('T')[0];
            else if (valData.includes('/')) {
                const partes = valData.split('/'); // DD/MM/YYYY
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            else if (valData.includes('-')) dataFormatada = valData;

            if (!dataFormatada) return null;

            // 2. EMPRESA (Agora opcional, para não perder dados)
            const idEmpresa = linha['company_id'] || linha['company id'] || '0';
            let nomeEmpresa = linha['empresa'] || linha['nome da ppc'] || 'Empresa não informada';

            // 3. ASSISTENTE & AUDITORA
            const assistente = linha['assistente'] || linha['id_assistente'] || 'Desconhecido';
            const auditora = linha['auditora'] || 'Sistema';

            // 4. STATUS & RESULTADOS
            // Importante: Pega 'status' (minusculo) pois o header foi transformado
            const statusFinal = linha['status'] || 'PROCESSADO'; 
            
            return {
                data_auditoria: dataFormatada,
                company_id: idEmpresa.toString().trim(),
                empresa: nomeEmpresa.trim(),
                assistente: assistente,
                doc_name: linha['doc_name'] || linha['documento'] || linha['nome_documento'] || '-',
                status: statusFinal, 
                obs: (linha['apontamentos/obs'] || linha['obs'] || ''),
                campos: parseInt(linha['nº campos']) || 0,
                ok: parseInt(linha['ok']) || 0,
                nok: parseInt(linha['nok']) || 0,
                porcentagem: linha['% assert'] || linha['assertividade'] || '0%',
                auditora: auditora
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        if (total === 0) {
            alert("Nenhum registro válido identificado.");
            return;
        }

        statusEl.innerHTML = `<span class="text-orange-500 font-bold">Importando ${total} registros...</span>`;

        // Lote
        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        // Final
        let msg = `Sucesso: ${sucesso}`;
        if(erros > 0) msg += ` | Erros: ${erros}`;
        statusEl.innerHTML = `<span class="text-emerald-600 font-bold">${msg}</span>`;
        
        if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
        alert("Importação Concluída!\nRecomendado: Atualize a tela de Produtividade.");
    }
};