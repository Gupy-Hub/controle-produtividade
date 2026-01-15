window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

// === IMPORTADOR DE PRODUÇÃO: DATA VIA NOME DO ARQUIVO ===
Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    
    init: function() {
        console.log("📥 Importação de Produção: Iniciada (Modo Nome do Arquivo)");
    },

    processar: function(input) {
        const file = input.files[0];
        if (!file) return;

        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${file.name}...</span>`;

        // 1. Extração da Data do Nome do Arquivo
        const dataArquivo = this.extrairDataDoNome(file.name);

        if (!dataArquivo) {
            alert(`⚠️ ERRO DE NOME DE ARQUIVO:\n\nO arquivo "${file.name}" não contém uma data no formato DDMMAAAA (ex: 01122025.csv).\n\nRenomeie o arquivo para incluir a data e tente novamente.`);
            input.value = '';
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        console.log(`📅 Data extraída do arquivo: ${dataArquivo}`);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: (results) => {
                this.analisarDados(results.data, dataArquivo);
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                if(statusEl) statusEl.innerHTML = "";
            }
        });
        
        input.value = '';
    },

    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            if (parseInt(mes) > 12 || parseInt(dia) > 31) return null;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    analisarDados: async function(linhas, dataFixa) {
        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');

        if (linhas.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert("O arquivo está vazio.");
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-calculator"></i> Processando linhas...</span>`;
        await new Promise(r => setTimeout(r, 50));

        let contador = 0;
        let ignorados = 0;

        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            
            if (!idRaw || (row['assistente'] && row['assistente'].toLowerCase() === 'total')) {
                ignorados++;
                continue;
            }

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!usuarioId) {
                ignorados++;
                continue;
            }

            let quantidade = 0;
            if (row['documentos_validados']) {
                quantidade = parseInt(row['documentos_validados']) || 0;
            } else if (row['quantidade'] || row['qtd']) {
                quantidade = parseInt(row['quantidade'] || row['qtd']) || 0;
            } else {
                quantidade = 1;
            }

            const fifo = parseInt(row['fifo'] || row['documentos_validados_fifo']) || 0;
            const gTotal = parseInt(row['gradual_total'] || row['gradual total'] || row['documentos_validados_gradual_total']) || 0;
            const gParcial = parseInt(row['gradual_parcial'] || row['gradual parcial'] || row['documentos_validados_gradual_parcial']) || 0;
            const perfilFc = parseInt(row['perfil_fc'] || row['perfil fc'] || row['documentos_validados_perfil_fc']) || 0;

            let statusFinal = 'OK';
            if (row['status']) {
                const s = row['status'].toUpperCase();
                if (s.includes('NOK') || s.includes('ERRO')) statusFinal = 'NOK';
            }

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                quantidade: quantidade,
                status: statusFinal,
                fifo: fifo,
                gradual_total: gTotal,
                gradual_parcial: gParcial,
                perfil_fc: perfilFc,
                fator: 1
            });
            
            contador++;
        }

        if(statusEl) statusEl.innerHTML = "";

        if (contador === 0) {
            return alert("Nenhum dado válido encontrado. Verifique se o arquivo possui a coluna 'id_assistente'.");
        }

        const [ano, mes, dia] = dataFixa.split('-');
        const dataExibicao = `${dia}/${mes}/${ano}`;
        
        // --- VERIFICAÇÃO DE INTEGRIDADE (Nexus Operacional) ---
        const { count, error } = await Sistema.supabase
            .from('producao')
            .select('*', { count: 'exact', head: true })
            .eq('data_referencia', dataFixa);
            
        let msgExtra = "";
        let deveSubstituir = false;
        
        if (count > 0) {
            msgExtra = `\n⚠️ ATENÇÃO: JÁ EXISTEM ${count} REGISTROS NESTA DATA (${dataExibicao})!\n\nSe continuar, os dados ANTIGOS SERÃO APAGADOS e substituídos pelos novos.`;
            deveSubstituir = true;
        }

        const msg = `Resumo da Importação:\n\n` +
                    `📅 Data Detectada: ${dataExibicao}\n` +
                    `📊 Registros Válidos: ${contador}\n` +
                    `🗑️ Linhas Ignoradas: ${ignorados}` +
                    msgExtra + `\n\n` +
                    `Confirmar gravação no banco de dados?`;

        if (confirm(msg)) {
            this.salvarNoBanco(deveSubstituir, dataFixa);
        }
    },

    salvarNoBanco: async function(deveSubstituir, dataFixa) {
        const statusEl = document.getElementById('status-importacao-prod');
        
        // Limpeza prévia para garantir integridade
        if (deveSubstituir) {
            if(statusEl) statusEl.innerHTML = `<span class="text-rose-500 font-bold">🗑️ Limpando dados antigos...</span>`;
            const { error: errDel } = await Sistema.supabase
                .from('producao')
                .delete()
                .eq('data_referencia', dataFixa);
                
            if (errDel) {
                alert("Erro ao limpar dados antigos: " + errDel.message);
                if(statusEl) statusEl.innerHTML = "";
                return;
            }
        }

        const payload = this.dadosProcessados;
        const total = payload.length;
        const BATCH_SIZE = 1000;
        let enviados = 0;

        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Enviando dados...</span>`;
        
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = payload.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('producao')
                .insert(chunk);
            
            if (error) {
                console.error(error);
                if(statusEl) statusEl.innerHTML = "";
                alert("Erro ao salvar lote: " + error.message);
                return;
            }
            
            enviados += chunk.length;
            if(statusEl) {
                const pct = Math.round((enviados/total)*100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> ${pct}%</span>`;
            }
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Sucesso!</span>`;
        
        setTimeout(() => { 
            if(statusEl) statusEl.innerHTML = ""; 
        }, 3000);
        
        alert("Produção importada com sucesso!");
        
        if (Produtividade.Geral && Produtividade.Geral.carregarTela) {
            const [ano, mes, dia] = this.dadosProcessados[0].data_referencia.split('-');
            const elDia = document.getElementById('sel-data-dia');
            const elMes = document.getElementById('sel-mes');
            const elAno = document.getElementById('sel-ano');

            if (elDia) elDia.value = this.dadosProcessados[0].data_referencia;
            if (elMes) elMes.value = parseInt(mes) - 1; 
            if (elAno) elAno.value = ano;
            
            Produtividade.Geral.carregarTela();
        }
    }
};