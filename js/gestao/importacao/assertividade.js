window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo arquivo CSV...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                return header.trim().replace(/"/g, '').toLowerCase();
            },
            complete: async (results) => {
                if (results.data.length === 0) {
                    alert("Arquivo vazio ou ilegível.");
                    if(statusEl) statusEl.innerText = "";
                    return;
                }
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro leitura: " + err.message);
                if(statusEl) statusEl.innerText = "Erro na leitura.";
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;
        const TAMANHO_LOTE = 1000;

        // 1. MAPEAMENTO E LIMPEZA DOS DADOS
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-filter"></i> Processando dados...</span>`;
        
        // Pequeno delay para a UI atualizar
        await new Promise(r => setTimeout(r, 50));

        const dadosFormatados = linhas.map(linha => {
            let valData = linha['end_time']; 
            if (!valData) return null; 

            // Formatação de Data
            let dataFormatada = null;
            let apenasData = valData.split('T')[0].split(' ')[0];

            if (apenasData.includes('/')) {
                const partes = apenasData.split('/'); 
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            else if (apenasData.includes('-')) {
                dataFormatada = apenasData; 
            }

            if (!dataFormatada) return null;

            const idEmpresa = linha['company_id'] || linha['company id'] || '0';
            let nomeEmpresa = linha['empresa'] || linha['nome da ppc'] || 'Empresa não informada';
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
                porcentagem: linha['% assert'] || linha['assertividade'] || '0%',
                auditora: linha['auditora'] || 'Sistema'
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        if (total === 0) {
            alert("Nenhum registro válido encontrado (Verifique a coluna 'end_time').");
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. PREVENÇÃO DE DUPLICIDADE
        if(statusEl) statusEl.innerHTML = `<span class="text-amber-600"><i class="fas fa-eraser"></i> Limpando dados anteriores...</span>`;
        await new Promise(r => setTimeout(r, 50));
        
        const datasParaLimpar = [...new Set(dadosFormatados.map(d => d.data_auditoria))];
        
        try {
            const { error: errDel } = await Sistema.supabase
                .from('assertividade')
                .delete()
                .in('data_auditoria', datasParaLimpar);

            if (errDel) throw errDel;

        } catch (e) {
            console.error("Erro ao limpar:", e);
            alert("Erro ao limpar dados antigos: " + e.message);
            if(statusEl) statusEl.innerHTML = "Erro na limpeza.";
            return;
        }

        // 3. INSERÇÃO COM BARRA DE PROGRESSO
        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Iniciando importação...</span>`;

        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }

            // ATUALIZA O PROGRESSO NA TELA
            if (statusEl) {
                const percentual = Math.round(((i + lote.length) / total) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-upload"></i> Importando: ${percentual}% (${i + lote.length}/${total})</span>`;
            }
        }

        // 4. FINALIZAÇÃO
        let msg = `Sucesso: ${sucesso}`;
        if(erros > 0) msg += ` | Erros: ${erros}`;
        
        if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check-circle"></i> Concluído! ${msg}</span>`;
        
        if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
        
        // Pequeno delay antes do alert para ver o 100%
        setTimeout(() => {
            alert(`Importação Finalizada!\n\nDados atualizados para: ${datasParaLimpar.join(', ')}.\n${msg}`);
        }, 500);
    }
};