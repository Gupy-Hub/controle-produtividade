window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo arquivo...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                // Normaliza cabeçalhos para evitar erros de Case Sensitive
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

        // 1. MAPEAMENTO E LIMPEZA DOS DADOS
        const dadosFormatados = linhas.map(linha => {
            
            // 1. DATA (REGRA ESTRITA: APENAS END_TIME)
            // Ignoramos 'data da auditoria' pois pode conter erros manuais.
            let valData = linha['end_time']; 

            if (!valData) return null; // Sem data de sistema = Inválido

            // Tratamento de Formatação
            // O end_time geralmente vem como "2025-12-01T14:30:00" ou "01/12/2025 14:30"
            let dataFormatada = null;
            
            // Pega apenas a parte da data (antes do T ou do primeiro espaço)
            let apenasData = valData.split('T')[0].split(' ')[0];

            if (apenasData.includes('/')) {
                const partes = apenasData.split('/'); // DD/MM/YYYY
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            else if (apenasData.includes('-')) {
                dataFormatada = apenasData; // Já está em YYYY-MM-DD
            }

            if (!dataFormatada) return null;

            // Empresa (Aceita falta de ID salvando como '0')
            const idEmpresa = linha['company_id'] || linha['company id'] || '0';
            let nomeEmpresa = linha['empresa'] || linha['nome da ppc'] || 'Empresa não informada';

            // Status (Captura status para cálculo de média)
            const statusFinal = linha['status'] || 'PROCESSADO';

            return {
                data_auditoria: dataFormatada,
                company_id: idEmpresa.toString().trim(),
                empresa: nomeEmpresa.trim(),
                assistente: linha['assistente'] || linha['id_assistente'] || 'Desconhecido',
                doc_name: linha['doc_name'] || linha['documento'] || linha['nome_documento'] || '-',
                status: statusFinal, 
                obs: (linha['apontamentos/obs'] || linha['obs'] || ''),
                campos: parseInt(linha['nº campos']) || 0,
                ok: parseInt(linha['ok']) || 0,
                nok: parseInt(linha['nok']) || 0,
                // Captura a % Assert do arquivo para usar na média ponderada
                porcentagem: linha['% assert'] || linha['assertividade'] || '0%',
                auditora: linha['auditora'] || 'Sistema'
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        if (total === 0) {
            alert("Nenhum registro válido encontrado. Verifique se a coluna 'end_time' existe no arquivo.");
            statusEl.innerHTML = "";
            return;
        }

        // 2. PREVENÇÃO DE DUPLICIDADE (CLEAN INSERT)
        // Apaga dados antigos baseados nas datas encontradas no END_TIME
        statusEl.innerHTML = `<span class="text-amber-500"><i class="fas fa-eraser"></i> Atualizando dados (Data Ref: end_time)...</span>`;
        
        const datasParaLimpar = [...new Set(dadosFormatados.map(d => d.data_auditoria))];
        
        try {
            const { error: errDel } = await Sistema.supabase
                .from('assertividade')
                .delete()
                .in('data_auditoria', datasParaLimpar);

            if (errDel) throw errDel;

        } catch (e) {
            console.error("Erro ao limpar duplicidade:", e);
            alert("Erro ao limpar dados antigos: " + e.message);
            statusEl.innerHTML = "Erro na limpeza.";
            return;
        }

        // 3. INSERÇÃO
        statusEl.innerHTML = `<span class="text-orange-500 font-bold">Importando ${total} registros...</span>`;

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

        // 4. FINALIZAÇÃO
        let msg = `Sucesso: ${sucesso}`;
        if(erros > 0) msg += ` | Erros: ${erros}`;
        
        statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> ${msg}</span>`;
        
        if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
        
        alert(`Importação Concluída!\n\nDados atualizados com base na coluna 'end_time'.\nDatas afetadas: ${datasParaLimpar.join(', ')}`);
    }
};